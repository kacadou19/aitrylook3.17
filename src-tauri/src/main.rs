#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

/// 获取项目存储目录（用户数据目录/aitrylook_projects）
fn get_projects_dir() -> Result<PathBuf, String> {
    let base = dirs::data_local_dir()
        .or_else(|| dirs::home_dir())
        .ok_or("无法获取用户数据目录")?;
    let dir = base.join("AITryLook").join("projects");
    if !dir.exists() {
        fs::create_dir_all(&dir).map_err(|e| format!("创建项目目录失败: {}", e))?;
    }
    Ok(dir)
}

#[derive(Serialize, Deserialize)]
struct ProjectMeta {
    id: String,
    name: String,
    #[serde(rename = "createdAt")]
    created_at: u64,
    #[serde(rename = "updatedAt")]
    updated_at: u64,
}

#[tauri::command]
fn get_projects_path() -> Result<String, String> {
    let dir = get_projects_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn list_projects() -> Result<Vec<ProjectMeta>, String> {
    let dir = get_projects_dir()?;
    let meta_path = dir.join("_index.json");
    if !meta_path.exists() {
        return Ok(vec![]);
    }
    let content = fs::read_to_string(&meta_path)
        .map_err(|e| format!("读取项目列表失败: {}", e))?;
    let list: Vec<ProjectMeta> = serde_json::from_str(&content)
        .map_err(|e| format!("解析项目列表失败: {}", e))?;
    Ok(list)
}

#[tauri::command]
fn save_project(id: String, name: String, data: String, created_at: u64, updated_at: u64) -> Result<(), String> {
    let dir = get_projects_dir()?;

    // 保存项目数据文件
    let data_path = dir.join(format!("{}.json", id));
    fs::write(&data_path, &data)
        .map_err(|e| format!("保存项目数据失败: {}", e))?;

    // 更新索引
    let meta_path = dir.join("_index.json");
    let mut list: Vec<ProjectMeta> = if meta_path.exists() {
        let content = fs::read_to_string(&meta_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        vec![]
    };

    // 更新或新增
    if let Some(existing) = list.iter_mut().find(|p| p.id == id) {
        existing.name = name;
        existing.updated_at = updated_at;
    } else {
        list.insert(0, ProjectMeta { id, name, created_at, updated_at });
    }

    let index_json = serde_json::to_string_pretty(&list)
        .map_err(|e| format!("序列化索引失败: {}", e))?;
    fs::write(&meta_path, index_json)
        .map_err(|e| format!("保存索引失败: {}", e))?;

    Ok(())
}

#[tauri::command]
fn load_project(id: String) -> Result<String, String> {
    let dir = get_projects_dir()?;
    let data_path = dir.join(format!("{}.json", id));
    if !data_path.exists() {
        return Err("项目文件不存在".to_string());
    }
    fs::read_to_string(&data_path)
        .map_err(|e| format!("读取项目数据失败: {}", e))
}

#[tauri::command]
fn delete_project(id: String) -> Result<(), String> {
    let dir = get_projects_dir()?;

    // 删除数据文件
    let data_path = dir.join(format!("{}.json", id));
    if data_path.exists() {
        fs::remove_file(&data_path)
            .map_err(|e| format!("删除项目文件失败: {}", e))?;
    }

    // 更新索引
    let meta_path = dir.join("_index.json");
    if meta_path.exists() {
        let content = fs::read_to_string(&meta_path).unwrap_or_default();
        let mut list: Vec<ProjectMeta> = serde_json::from_str(&content).unwrap_or_default();
        list.retain(|p| p.id != id);
        let index_json = serde_json::to_string_pretty(&list)
            .map_err(|e| format!("序列化索引失败: {}", e))?;
        fs::write(&meta_path, index_json)
            .map_err(|e| format!("保存索引失败: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
fn read_file_text(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
fn read_file_binary(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

/// 写入文本文件到指定路径
#[tauri::command]
fn write_file_text(path: String, content: String) -> Result<(), String> {
    // 确保父目录存在
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(&path, &content)
        .map_err(|e| format!("写入文件失败: {}", e))
}

/// 写入二进制文件到指定路径
#[tauri::command]
fn write_file_binary(path: String, content: Vec<u8>) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(&path, &content)
        .map_err(|e| format!("写入文件失败: {}", e))
}

/// 列出目录中匹配前缀和后缀的文件名
#[tauri::command]
fn list_files_in_dir(dir: String, prefix: String, suffix: String) -> Result<Vec<String>, String> {
    let path = std::path::Path::new(&dir);
    if !path.exists() || !path.is_dir() {
        return Ok(vec![]);
    }
    let mut files: Vec<String> = vec![];
    let entries = fs::read_dir(path).map_err(|e| format!("读取目录失败: {}", e))?;
    for entry in entries {
        if let Ok(entry) = entry {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) && name.ends_with(&suffix) {
                files.push(name);
            }
        }
    }
    files.sort();
    Ok(files)
}

/// 删除指定路径的文件
#[tauri::command]
fn delete_file(path: String) -> Result<(), String> {
    let p = std::path::Path::new(&path);
    if p.exists() {
        fs::remove_file(p).map_err(|e| format!("删除文件失败: {}", e))?;
    }
    Ok(())
}

/// 使用原生对话框选择文件夹，返回完整路径
#[tauri::command]
async fn pick_directory() -> Result<String, String> {
    let result = std::thread::spawn(|| {
        rfd::FileDialog::new().pick_folder()
    }).join().map_err(|_| "对话框线程异常".to_string())?;
    match result {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("用户取消选择".to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_projects_path,
            list_projects,
            save_project,
            load_project,
            delete_project,
            read_file_text,
            read_file_binary,
            write_file_text,
            write_file_binary,
            list_files_in_dir,
            delete_file,
            pick_directory
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
