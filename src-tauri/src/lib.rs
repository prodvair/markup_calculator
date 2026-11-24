use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "formulas.json";
const DEFAULT_PASSWORD_HASH: &str =
    "sha256:runar-calc-v1:7402c17c40cfc97fced8fe7851d3afc932d35169cb6e24891f501a9ef7fce25b";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RangeRow {
    id: String,
    min: f64,
    max: Option<f64>,
    value: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    version: u32,
    password_hash: String,
    rounding_step: f64,
    delivery: Vec<RangeRow>,
    markup: Vec<RangeRow>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            password_hash: DEFAULT_PASSWORD_HASH.to_string(),
            rounding_step: 100.0,
            delivery: vec![
                row("d1", 0.0, Some(500.0), 100.0),
                row("d2", 501.0, Some(1000.0), 200.0),
                row("d3", 1001.0, Some(3000.0), 300.0),
                row("d4", 3001.0, Some(8000.0), 400.0),
                row("d5", 8001.0, Some(11000.0), 500.0),
                row("d6", 11001.0, None, 500.0),
            ],
            markup: vec![
                row("m1", 0.0, Some(400.0), 80.0),
                row("m2", 401.0, Some(600.0), 70.0),
                row("m3", 601.0, Some(700.0), 60.0),
                row("m4", 701.0, Some(1000.0), 50.0),
                row("m5", 1001.0, Some(2000.0), 35.0),
                row("m6", 2001.0, Some(5000.0), 30.0),
                row("m7", 5001.0, Some(19000.0), 20.0),
                row("m8", 19001.0, Some(50000.0), 15.0),
                row("m9", 50001.0, Some(100000.0), 30.0),
                row("m10", 100001.0, None, 30.0),
            ],
        }
    }
}

fn row(id: &str, min: f64, max: Option<f64>, value: f64) -> RangeRow {
    RangeRow {
        id: id.to_string(),
        min,
        max,
        value,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfigPayload {
    config: AppConfig,
    path: String,
    source: &'static str,
}

fn can_write_next_to(path: &Path) -> bool {
    let parent = match path.parent() {
        Some(parent) => parent,
        None => return false,
    };

    if !parent.exists() && fs::create_dir_all(parent).is_err() {
        return false;
    }

    let probe = parent.join(format!(".formulas_write_test_{}", std::process::id()));
    match fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&probe)
    {
        Ok(mut file) => {
            let ok = file.write_all(b"").is_ok();
            drop(file);
            let _ = fs::remove_file(&probe);
            ok
        }
        Err(_) => false,
    }
}

/// Предпочитаем файл рядом с исполняемым файлом. Если каталог только для чтения
/// (типично для Program Files / подписанного .app), используем каталог настроек ОС.
fn resolve_path(app: &AppHandle) -> Result<(PathBuf, &'static str), String> {
    if let Ok(executable) = env::current_exe() {
        if let Some(parent) = executable.parent() {
            let candidate = parent.join(FILE_NAME);
            if can_write_next_to(&candidate) {
                return Ok((candidate, "executable"));
            }
        }
    }

    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Не удалось определить каталог настроек: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Не удалось создать каталог настроек: {error}"))?;
    Ok((directory.join(FILE_NAME), "app_config"))
}

fn write_json(path: &Path, config: &AppConfig) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(config)
        .map_err(|error| format!("Не удалось сериализовать формулы: {error}"))?;
    fs::write(path, contents).map_err(|error| format!("Не удалось записать {}: {error}", path.display()))
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<ConfigPayload, String> {
    let (path, source) = resolve_path(&app)?;
    let config = if path.exists() {
        let contents = fs::read_to_string(&path)
            .map_err(|error| format!("Не удалось прочитать {}: {error}", path.display()))?;
        serde_json::from_str(&contents)
            .map_err(|error| format!("Ошибка в файле {}: {error}", path.display()))?
    } else {
        let config = AppConfig::default();
        write_json(&path, &config)?;
        config
    };

    Ok(ConfigPayload {
        config,
        path: path.to_string_lossy().into_owned(),
        source,
    })
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<ConfigPayload, String> {
    let (path, source) = resolve_path(&app)?;
    write_json(&path, &config)?;

    Ok(ConfigPayload {
        config,
        path: path.to_string_lossy().into_owned(),
        source,
    })
}

#[tauri::command]
fn copy_to_clipboard(text: String) -> Result<(), String> {
    let mut clipboard = arboard::Clipboard::new()
        .map_err(|error| format!("Не удалось открыть буфер обмена: {error}"))?;
    clipboard
        .set_text(text)
        .map_err(|error| format!("Не удалось скопировать: {error}"))
}

#[tauri::command]
fn reveal_config(app: AppHandle) -> Result<(), String> {
    let (path, _) = resolve_path(&app)?;
    let directory = path.parent().unwrap_or(Path::new("."));

    #[cfg(target_os = "macos")]
    let status = Command::new("open").arg(directory).status();
    #[cfg(target_os = "windows")]
    let status = Command::new("explorer").arg(directory).status();
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let status = Command::new("xdg-open").arg(directory).status();

    status.map_err(|error| format!("Не удалось открыть папку: {error}"))?;
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            load_config,
            save_config,
            copy_to_clipboard,
            reveal_config
        ])
        .run(tauri::generate_context!())
        .expect("ошибка при запуске приложения");
}
