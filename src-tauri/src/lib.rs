use std::fs;

/// 파일을 글자로 읽는다. UTF-8 BOM은 떼고, 깨진 바이트는 대체 문자로 바꾼다.
#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let bytes = bytes.strip_prefix(b"\xEF\xBB\xBF").unwrap_or(&bytes);
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

#[tauri::command]
fn write_file(path: String, contents: String) -> Result<(), String> {
    fs::write(&path, contents).map_err(|e| e.to_string())
}

/// 그림 파일의 바이트를 그대로 넘긴다. 미리보기에 그림을 보여 줄 때 쓴다.
#[tauri::command]
fn read_image(path: String) -> Result<tauri::ipc::Response, String> {
    fs::read(&path)
        .map(tauri::ipc::Response::new)
        .map_err(|e| e.to_string())
}

/// 탐색기에서 .md를 더블클릭하면 그 경로가 첫 인자로 들어온다.
#[tauri::command]
fn initial_file() -> Option<String> {
    std::env::args().skip(1).find(|a| !a.starts_with('-'))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_file, write_file, read_image, initial_file])
        .run(tauri::generate_context!())
        .expect("마크다운 편집기를 시작하지 못했습니다");
}
