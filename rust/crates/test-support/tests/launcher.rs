#![cfg(feature = "museum")]

use std::{
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::TcpStream,
    path::PathBuf,
    process::{Child, Command, ExitStatus, Stdio},
    sync::mpsc,
    time::{Duration, Instant},
};

use ente_test_support::{TestResult, account_fixture::create_account};

#[test]
fn external_runner_can_use_museum_and_control_cleanup() -> TestResult {
    for command in [Some("stop"), None, Some("failed")] {
        let (mut launcher, ready) = Launcher::start()?;
        let endpoint = field(&ready, "endpoint")?;
        let logs_dir = PathBuf::from(field(&ready, "logs_dir")?);
        let temp_dir = logs_dir.parent().ok_or("missing test directory")?;
        assert_eq!(field(&ready, "email_suffix")?, "@example.org");
        assert_eq!(field(&ready, "ott")?, "123456");
        assert!(logs_dir.join("museum.log").exists());
        assert!(ping(endpoint)?);

        if command == Some("stop") {
            // Exercise the real API and database through the advertised URL.
            let account = tokio::runtime::Runtime::new()?
                .block_on(create_account(endpoint, "external-runner"))?;
            assert!(account.email.ends_with(field(&ready, "email_suffix")?));
        }

        if let Some(command) = command {
            writeln!(
                launcher.0.stdin.as_mut().ok_or("missing stdin")?,
                "{command}"
            )?;
        } else {
            launcher.0.stdin.take();
        }
        let status = launcher.wait()?;
        assert_eq!(status.success(), command != Some("failed"));
        assert!(!ping(endpoint)?);

        if command == Some("failed") {
            assert!(logs_dir.join("museum.log").exists());
            fs::remove_dir_all(temp_dir)?;
        } else {
            assert!(!temp_dir.exists());
        }
    }
    Ok(())
}

#[cfg(unix)]
#[test]
fn termination_signal_cleans_up_with_stdin_still_open() -> TestResult {
    for signal in ["-TERM", "-INT"] {
        let (mut launcher, ready) = Launcher::start()?;
        let endpoint = field(&ready, "endpoint")?;
        let logs_dir = PathBuf::from(field(&ready, "logs_dir")?);
        assert!(ping(endpoint)?);

        let status = Command::new("kill")
            .args([signal, &launcher.0.id().to_string()])
            .status()?;
        assert!(status.success());
        assert!(launcher.wait()?.success());
        assert!(!ping(endpoint)?);
        assert!(!logs_dir.parent().ok_or("missing test directory")?.exists());
    }
    Ok(())
}

fn field<'a>(ready: &'a serde_json::Value, key: &str) -> TestResult<&'a str> {
    ready[key]
        .as_str()
        .ok_or_else(|| format!("missing readiness field: {key}").into())
}

struct Launcher(Child);

impl Launcher {
    fn start() -> TestResult<(Self, serde_json::Value)> {
        let mut launcher = Self(
            Command::new(env!("CARGO_BIN_EXE_ente-test-museum"))
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .spawn()?,
        );
        let stdout = launcher.0.stdout.take().ok_or("missing stdout")?;
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            let mut line = String::new();
            let result = BufReader::new(stdout).read_line(&mut line).map(|_| line);
            let _ = sender.send(result);
        });
        let line = receiver.recv_timeout(Duration::from_secs(180))??;
        let ready = serde_json::from_str(&line)?;
        Ok((launcher, ready))
    }

    fn wait(&mut self) -> TestResult<ExitStatus> {
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if let Some(status) = self.0.try_wait()? {
                return Ok(status);
            }
            if Instant::now() >= deadline {
                return Err("launcher did not shut down within 30 seconds".into());
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}

impl Drop for Launcher {
    fn drop(&mut self) {
        // Close stdin so even a failed assertion gives the launcher a chance to
        // stop Museum and Postgres gracefully before resorting to a hard kill.
        self.0.stdin.take();
        if self.wait().is_err() {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }
}

fn ping(endpoint: &str) -> TestResult<bool> {
    let address = endpoint.strip_prefix("http://").ok_or("invalid endpoint")?;
    let Ok(mut stream) = TcpStream::connect(address) else {
        return Ok(false);
    };
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.write_all(b"GET /ping HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")?;
    let mut response = String::new();
    stream.read_to_string(&mut response)?;
    Ok(response.starts_with("HTTP/1.1 200"))
}
