use std::io::{self, Write};

use ente_test_support::{HARDCODED_OTT, HARDCODED_OTT_EMAIL_SUFFIX, Museum, TestResult};
use tokio::sync::mpsc;

fn main() -> TestResult {
    if std::env::args_os().len() != 1 {
        return Err(
            "ente-test-museum takes no arguments; see crates/test-support/README.md".into(),
        );
    }

    let runtime = tokio::runtime::Runtime::new()?;
    let mut shutdown = {
        let _guard = runtime.enter();
        shutdown_receiver()?
    };

    Museum::run(|museum| {
        // stdout is a machine-readable readiness protocol. Museum and build
        // diagnostics go to log files and stderr, respectively.
        println!(
            "{}",
            serde_json::json!({
                "endpoint": museum.endpoint(),
                "email_suffix": HARDCODED_OTT_EMAIL_SUFFIX,
                "ott": HARDCODED_OTT,
                "logs_dir": museum.temp_dir().join("logs"),
            })
        );
        io::stdout().flush()?;

        let failed = runtime
            .block_on(shutdown.recv())
            .ok_or("shutdown channel closed")??;
        if failed {
            Err("external test runner reported failure".into())
        } else {
            Ok(())
        }
    })
}

// Read stdin on a separate thread: Tokio's stdin cannot be cancelled, and can
// prevent runtime shutdown when the launcher receives a signal.
fn shutdown_receiver() -> io::Result<mpsc::UnboundedReceiver<io::Result<bool>>> {
    let (sender, receiver) = mpsc::unbounded_channel();

    #[cfg(unix)]
    for kind in [
        tokio::signal::unix::SignalKind::interrupt(),
        tokio::signal::unix::SignalKind::terminate(),
    ] {
        let mut signal = tokio::signal::unix::signal(kind)?;
        let sender = sender.clone();
        tokio::spawn(async move {
            signal.recv().await;
            let _ = sender.send(Ok(false));
        });
    }

    #[cfg(not(unix))]
    {
        let sender = sender.clone();
        tokio::spawn(async move {
            let _ = sender.send(tokio::signal::ctrl_c().await.map(|()| false));
        });
    }

    std::thread::spawn(move || {
        let result = (|| {
            let mut line = String::new();
            io::stdin().read_line(&mut line)?;
            match line.trim() {
                "" | "stop" => Ok(false),
                "failed" => Ok(true),
                _ => Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "expected stop, failed, or stdin EOF",
                )),
            }
        })();
        let _ = sender.send(result);
    });

    Ok(receiver)
}
