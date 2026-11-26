#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::{Path, PathBuf};

fn resolve_project_root() -> PathBuf {
    if let Ok(env_root) = std::env::var("PROJECT_ROOT") {
        if !env_root.trim().is_empty() {
            return swarm_server::fs_safe::absolutize_path(Path::new(&env_root))
                .unwrap_or_else(|_| PathBuf::from(env_root));
        }
    }

    for candidate in ["server/demo-project", "../server/demo-project"] {
        let p = Path::new(candidate);
        if p.exists() {
            if let Ok(abs) = swarm_server::fs_safe::absolutize_path(p) {
                return abs;
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        for ancestor in exe.ancestors() {
            let candidate = ancestor.join("server").join("demo-project");
            if candidate.exists() {
                return candidate;
            }
        }
    }

    swarm_server::resolve_project_root()
}

fn main() {
    tauri::Builder::default()
        .setup(|_app| {
            let port: u16 = std::env::var("PORT")
                .ok()
                .and_then(|v| v.parse().ok())
                .unwrap_or(4000);
            let project_root = resolve_project_root();

            tauri::async_runtime::spawn(async move {
                if let Err(err) = swarm_server::run_server(port, project_root).await {
                    if err.kind() == std::io::ErrorKind::AddrInUse {
                        eprintln!(
                            "[tauri] porta {port} já está em uso por outro servidor; continuando com a instância existente."
                        );
                    } else {
                        eprintln!("[tauri] erro ao iniciar swarm_server na porta {port}: {err}");
                    }
                }
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Swarm IDE desktop application");
}
