use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    env, fs,
    io::Write,
    path::{Path, PathBuf},
    process::Command,
    time::SystemTime,
};
use tauri::{AppHandle, Manager};

const FILE_NAME: &str = "formulas.json";
const HISTORY_FILE_NAME: &str = "history.json";
const DEFAULT_PASSWORD_HASH: &str =
    "sha256:runar-calc-v1:7402c17c40cfc97fced8fe7851d3afc932d35169cb6e24891f501a9ef7fce25b";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RangeRow {
    id: String,
    min: f64,
    max: Option<f64>,
    value: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BreakdownVisibility {
    rounded: bool,
    delivery: bool,
    with_delivery: bool,
    markup: bool,
}

impl Default for BreakdownVisibility {
    fn default() -> Self {
        Self {
            rounded: false,
            delivery: false,
            with_delivery: false,
            markup: false,
        }
    }
}

fn default_result_rounding_step() -> f64 {
    100.0
}

fn default_history_days() -> u32 {
    7
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppConfig {
    version: u32,
    password_hash: String,
    rounding_step: f64,
    #[serde(default = "default_result_rounding_step")]
    result_rounding_step: f64,
    delivery: Vec<RangeRow>,
    markup: Vec<RangeRow>,
    #[serde(default)]
    breakdown_visible: BreakdownVisibility,
    #[serde(default = "default_history_days")]
    history_days: u32,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            version: 1,
            password_hash: DEFAULT_PASSWORD_HASH.to_string(),
            rounding_step: 100.0,
            result_rounding_step: default_result_rounding_step(),
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
            breakdown_visible: BreakdownVisibility::default(),
            history_days: default_history_days(),
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryEntry {
    id: String,
    created_at: i64,
    input: f64,
    total: f64,
    #[serde(default)]
    comment: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryPayload {
    entries: Vec<HistoryEntry>,
    path: String,
}

/// Основной файл и его резервная копия в каталоге настроек ОС.
/// Копия переживает обновление приложения, даже если файл рядом с exe удалился.
struct StoragePaths {
    primary: PathBuf,
    mirror: Option<PathBuf>,
    source: &'static str,
}

impl StoragePaths {
    fn all(&self) -> Vec<PathBuf> {
        let mut paths = vec![self.primary.clone()];
        if let Some(mirror) = &self.mirror {
            if mirror != &self.primary {
                paths.push(mirror.clone());
            }
        }
        paths
    }
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

/// Основной файл лежит в каталоге настроек ОС — он не удаляется при замене .app.
/// Копия рядом с exe нужна только для удобства и обновляется при сохранении.
fn resolve_paths(app: &AppHandle, file_name: &str) -> Result<StoragePaths, String> {
    let directory = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("Не удалось определить каталог настроек: {error}"))?;
    fs::create_dir_all(&directory)
        .map_err(|error| format!("Не удалось создать каталог настроек: {error}"))?;
    let persistent = directory.join(file_name);

    let mirror = env::current_exe()
        .ok()
        .and_then(|executable| executable.parent().map(Path::to_path_buf))
        .map(|parent| parent.join(file_name))
        .filter(|candidate| candidate != &persistent && can_write_next_to(candidate));

    Ok(StoragePaths {
        primary: persistent,
        mirror,
        source: "app_config",
    })
}

/// Берём самую свежую валидную копию. Битый файл не мешает второй копии.
fn read_json_from_any<T: DeserializeOwned>(
    paths: &StoragePaths,
    label: &str,
) -> Result<Option<T>, String> {
    let mut best: Option<(T, SystemTime)> = None;
    let mut errors: Vec<String> = Vec::new();

    for path in paths.all() {
        if !path.exists() {
            continue;
        }
        let contents = match fs::read_to_string(&path) {
            Ok(contents) => contents,
            Err(error) => {
                errors.push(format!("Не удалось прочитать {}: {error}", path.display()));
                continue;
            }
        };
        let value: T = match serde_json::from_str(&contents) {
            Ok(value) => value,
            Err(error) => {
                errors.push(format!("Ошибка в файле {}: {error}", path.display()));
                continue;
            }
        };
        let modified = fs::metadata(&path)
            .and_then(|metadata| metadata.modified())
            .unwrap_or(SystemTime::UNIX_EPOCH);
        if best.as_ref().map_or(true, |(_, time)| modified > *time) {
            best = Some((value, modified));
        }
    }

    if let Some((value, _)) = best {
        return Ok(Some(value));
    }
    if errors.is_empty() {
        Ok(None)
    } else {
        Err(format!(
            "Не удалось загрузить {label}: {}",
            errors.join("; ")
        ))
    }
}

/// Старые версии писали файлы только внутрь .app. Оттуда можно забрать настройки,
/// если после замены приложения основной файл оказался пустым/дефолтным.
fn legacy_paths(file_name: &str) -> Vec<PathBuf> {
    let mut paths = Vec::new();

    #[cfg(target_os = "macos")]
    {
        for base in [
            "/Applications/Калькулятор наценки.app",
            "/Applications/Markup Calculator.app",
        ] {
            paths.push(Path::new(base).join("Contents/MacOS").join(file_name));
        }
        if let Ok(home) = env::var("HOME") {
            for name in ["Калькулятор наценки.app", "Markup Calculator.app"] {
                paths.push(
                    Path::new(&home)
                        .join("Applications")
                        .join(name)
                        .join("Contents/MacOS")
                        .join(file_name),
                );
            }
        }
    }

    paths
}

fn read_single_json<T: DeserializeOwned>(path: &Path) -> Option<T> {
    if !path.exists() {
        return None;
    }
    let contents = fs::read_to_string(path).ok()?;
    serde_json::from_str(&contents).ok()
}

fn write_json_to_all<T: Serialize>(
    paths: &StoragePaths,
    value: &T,
    label: &str,
) -> Result<(), String> {
    let contents = serde_json::to_string_pretty(value)
        .map_err(|error| format!("Не удалось сериализовать {label}: {error}"))?;
    for path in paths.all() {
        fs::write(&path, &contents)
            .map_err(|error| format!("Не удалось записать {}: {error}", path.display()))?;
    }
    Ok(())
}

#[tauri::command]
fn load_config(app: AppHandle) -> Result<ConfigPayload, String> {
    let paths = resolve_paths(&app, FILE_NAME)?;
    let mut config = read_json_from_any::<AppConfig>(&paths, "формулы")?.unwrap_or_default();

    // Если после обновления остался только дефолтный файл — пробуем старую версию.
    if config == AppConfig::default() {
        let current = paths.all();
        for path in legacy_paths(FILE_NAME) {
            if current.contains(&path) {
                continue;
            }
            if let Some(candidate) = read_single_json::<AppConfig>(&path) {
                if candidate != AppConfig::default() {
                    config = candidate;
                    break;
                }
            }
        }
    }

    write_json_to_all(&paths, &config, "формулы")?;

    Ok(ConfigPayload {
        config,
        path: paths.primary.to_string_lossy().into_owned(),
        source: paths.source,
    })
}

#[tauri::command]
fn save_config(app: AppHandle, config: AppConfig) -> Result<ConfigPayload, String> {
    let paths = resolve_paths(&app, FILE_NAME)?;
    write_json_to_all(&paths, &config, "формулы")?;

    Ok(ConfigPayload {
        config,
        path: paths.primary.to_string_lossy().into_owned(),
        source: paths.source,
    })
}

#[tauri::command]
fn load_history(app: AppHandle) -> Result<HistoryPayload, String> {
    let paths = resolve_paths(&app, HISTORY_FILE_NAME)?;
    let mut entries: Vec<HistoryEntry> =
        read_json_from_any(&paths, "историю")?.unwrap_or_default();

    if entries.is_empty() {
        let current = paths.all();
        for path in legacy_paths(HISTORY_FILE_NAME) {
            if current.contains(&path) {
                continue;
            }
            if let Some(candidate) = read_single_json::<Vec<HistoryEntry>>(&path) {
                if !candidate.is_empty() {
                    entries = candidate;
                    break;
                }
            }
        }
    }

    write_json_to_all(&paths, &entries, "историю")?;

    Ok(HistoryPayload {
        entries,
        path: paths.primary.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn save_history(app: AppHandle, entries: Vec<HistoryEntry>) -> Result<HistoryPayload, String> {
    let paths = resolve_paths(&app, HISTORY_FILE_NAME)?;
    write_json_to_all(&paths, &entries, "историю")?;

    Ok(HistoryPayload {
        entries,
        path: paths.primary.to_string_lossy().into_owned(),
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
    let paths = resolve_paths(&app, FILE_NAME)?;
    let directory = paths.primary.parent().unwrap_or(Path::new("."));

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
            load_history,
            save_history,
            copy_to_clipboard,
            reveal_config
        ])
        .run(tauri::generate_context!())
        .expect("ошибка при запуске приложения");
}
