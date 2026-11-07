use crate::types::{Locale, Model, Selection};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum State {
    Idle,
    Consenting,
    SelectingDeviceAndRegion,
    SelectingFirmware,
    DownloadingFirmware,
    SettingUpHotspot,
    WaitingForInternetSharing,
    AwaitingClient,
    AwaitingDeviceRequest,
    AwaitingConfirmation,
    SettingUpTrust,
    Armed,
    Serving,
    Flashing,
    Verifying,
    Done,
    CleaningUp,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StateEvent {
    pub state: State,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Default)]
pub struct SessionData {
    pub consent_general: bool,
    pub consent_recovery: bool,
    pub model: Option<Model>,
    pub locale: Option<Locale>,
    pub selection: Option<Selection>,
    pub firmware_path: Option<String>,
    pub firmware_sha256: Option<String>,
    pub bridge_ip: Option<String>,
    /// macOS: the "Share your connection from" service the user must pick.
    pub upstream_service: Option<String>,
    /// macOS: true when that service is the temporary loopback-backed one.
    pub upstream_adhoc: bool,
    pub ssid: Option<String>,
    pub psk: Option<String>,
    pub device_ip: Option<String>,
}

pub struct Orchestrator {
    state: RwLock<State>,
    data: RwLock<SessionData>,
    tx: broadcast::Sender<StateEvent>,
}

impl Orchestrator {
    pub fn new() -> Arc<Self> {
        let (tx, _rx) = broadcast::channel(64);
        Arc::new(Self {
            state: RwLock::new(State::Idle),
            data: RwLock::new(SessionData::default()),
            tx,
        })
    }

    pub fn subscribe(&self) -> broadcast::Receiver<StateEvent> {
        self.tx.subscribe()
    }

    pub async fn current_state(&self) -> State {
        *self.state.read().await
    }

    pub async fn data(&self) -> SessionData {
        let d = self.data.read().await;
        SessionData {
            consent_general: d.consent_general,
            consent_recovery: d.consent_recovery,
            model: d.model,
            locale: d.locale,
            selection: d.selection.clone(),
            firmware_path: d.firmware_path.clone(),
            firmware_sha256: d.firmware_sha256.clone(),
            bridge_ip: d.bridge_ip.clone(),
            upstream_service: d.upstream_service.clone(),
            upstream_adhoc: d.upstream_adhoc,
            ssid: d.ssid.clone(),
            psk: d.psk.clone(),
            device_ip: d.device_ip.clone(),
        }
    }

    pub async fn transition(&self, next: State, message: Option<String>) {
        let mut s = self.state.write().await;
        *s = next;
        let _ = self.tx.send(StateEvent {
            state: next,
            message,
            error: None,
        });
    }

    pub async fn fail(&self, error: impl Into<String>) {
        let mut s = self.state.write().await;
        *s = State::Failed;
        let _ = self.tx.send(StateEvent {
            state: State::Failed,
            message: None,
            error: Some(error.into()),
        });
    }

    pub async fn set_consent(&self, general: bool, recovery: bool) {
        let mut d = self.data.write().await;
        d.consent_general = general;
        d.consent_recovery = recovery;
    }

    pub async fn set_device(&self, model: Model, locale: Locale) {
        let mut d = self.data.write().await;
        d.model = Some(model);
        d.locale = Some(locale);
    }

    pub async fn set_selection(&self, sel: Selection) {
        let mut d = self.data.write().await;
        d.selection = Some(sel);
    }

    pub async fn set_firmware(&self, path: String, sha256: String) {
        let mut d = self.data.write().await;
        d.firmware_path = Some(path);
        d.firmware_sha256 = Some(sha256);
    }

    /// Record the upstream the helper picked, before the bridge exists, so
    /// the "turn on Internet Sharing" screen can name it.
    pub async fn set_upstream(&self, service: Option<String>, adhoc: bool) {
        let mut d = self.data.write().await;
        d.upstream_service = service;
        d.upstream_adhoc = adhoc;
    }

    pub async fn set_hotspot(&self, ssid: String, psk: String, bridge_ip: String) {
        let mut d = self.data.write().await;
        d.ssid = Some(ssid);
        d.psk = Some(psk);
        d.bridge_ip = Some(bridge_ip);
    }

    pub async fn set_device_ip(&self, ip: String) {
        let mut d = self.data.write().await;
        d.device_ip = Some(ip);
    }

    pub async fn cleanup(&self) {
        self.transition(State::CleaningUp, Some("Reverting changes…".into()))
            .await;
        // Real teardown is performed by helper. Stub: short pause then Idle.
        tokio::time::sleep(std::time::Duration::from_millis(400)).await;
        {
            let mut d = self.data.write().await;
            *d = SessionData::default();
        }
        self.transition(State::Idle, None).await;
    }
}
