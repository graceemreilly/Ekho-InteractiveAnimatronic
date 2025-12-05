// ============================================================================
// Ekho Bridge — UPDATED FOR PRESENTATION MODE + PAUSE/UNPAUSE
// Connects GPIO → Browser UI using SSE and button automation
// ============================================================================

(() => {
  const REALTIME_MODEL = "gpt-realtime-mini-2025-10-06";
  const CALLS_RE = /^https:\/\/api\.openai\.com\/v1\/realtime\/calls(\?model=.*)?$/;

  console.log("[EkhoBridge] Loaded. Active model:", REALTIME_MODEL);

  // ==========================================================================
  // GLOBAL STATE
  // ==========================================================================
  if (typeof window !== "undefined") {
    window.EkhoState = window.EkhoState || {
      speechMode: "normal",
      isAudioPlaying: false,
    };

    if (typeof window.EkhoMuteMic !== "function") {
      window.EkhoMuteMic = function (mute) {
        console.log("[EkhoBridge] EkhoMuteMic placeholder — mute =", mute);
      };
    }
  }

  // ==========================================================================
  // PATCH FETCH → redirect realtime API calls to our local backend proxy
  // ==========================================================================
  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(input, init = {}) {
    const url =
      typeof input === "string"
        ? input
        : typeof input === "object" && input?.url
        ? input.url
        : null;

    if (typeof url === "string" && CALLS_RE.test(url)) {
      console.log("[EkhoBridge] Redirecting realtime call → /realtime/calls");
      return originalFetch(`/realtime/calls?model=${REALTIME_MODEL}`, init);
    }

    return originalFetch(input, init);
  };

  // ==========================================================================
  // Utility — find a button that contains specific text
  // ==========================================================================
  function findButtonByText(matchText) {
    matchText = matchText.toLowerCase();
    const buttons = document.querySelectorAll("button");

    for (const btn of buttons) {
      const t = (btn.innerText || btn.textContent || "")
        .trim()
        .toLowerCase();

      if (t.includes(matchText)) return btn;
    }
    return null;
  }

  // ==========================================================================
  // SSE HOOKUP (GPIO → Browser)
  // ==========================================================================
  const evtSrc = new EventSource("/ekho/events");

  evtSrc.onmessage = (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch (err) {
      console.error("[EkhoBridge] SSE parse error:", err);
      return;
    }

    if (!data?.type) return;

    console.log("[EkhoBridge] SSE event:", data.type);

    // ========================================================================
    // GREEN BUTTON LOGIC — start session OR unpause/interupt
    // Wrapper sends: type = "start_or_unpause"
    // ========================================================================
    if (data.type === "start_or_unpause") {
      // ALWAYS unmute mic when green is pressed
      if (typeof window.EkhoMuteMic === "function") {
        window.EkhoMuteMic(false);
      }

      const isSpeaking =
        window.EkhoState && !!window.EkhoState.isAudioPlaying;

      if (isSpeaking) {
        // Interrupt audio playback
        console.log("[EkhoBridge] start_or_unpause: interrupting audio");

        const audios = document.querySelectorAll("audio");
        audios.forEach((a) => {
          try {
            a.pause();
            a.currentTime = a.duration || 0;
          } catch (_) {}
        });

        if (window.EkhoState) {
          window.EkhoState.isAudioPlaying = false;
        }

        return;
      }

      // Normal case: try to click "Start Session"
      console.log("[EkhoBridge] start_or_unpause: attempting Start Session");

      let attempts = 0;
      const timer = setInterval(() => {
        const startBtn =
          findButtonByText("start session") ||
          findButtonByText("starting session");

        if (startBtn) {
          console.log("[EkhoBridge] Clicking Start Session");
          startBtn.click();
          clearInterval(timer);
        } else if (++attempts > 60) {
          console.warn("[EkhoBridge] Could not find Start Session button");
          clearInterval(timer);
        }
      }, 100);
    }

    // ========================================================================
    // YELLOW BUTTON SINGLE PRESS — PAUSE / MUTE MIC
    // Wrapper sends: type = "pause"
    // ========================================================================
    if (data.type === "pause") {
      console.log("[EkhoBridge] pause: muting mic");
      if (typeof window.EkhoMuteMic === "function") {
        window.EkhoMuteMic(true);
      }
    }

    // ========================================================================
    // RED BUTTON TAP — Disconnect Session
    // Wrapper sends: type = "disconnect"
    // ========================================================================
    if (data.type === "disconnect") {
      console.log("[EkhoBridge] disconnect: attempting Disconnect");

      let attempts = 0;
      const tryClick = setInterval(() => {
        const disconnectBtn = findButtonByText("disconnect");

        if (disconnectBtn) {
          console.log("[EkhoBridge] Clicking Disconnect");
          disconnectBtn.click();
          clearInterval(tryClick);
        } else if (++attempts > 50) {
          console.warn("[EkhoBridge] Could not find Disconnect button");
          clearInterval(tryClick);
        }
      }, 100);
    }

    // ========================================================================
    // PRESENTATION MODE — from Yellow double-press (GPIO)
    // Wrapper sends: type = "presentation_mode"
    // ========================================================================
    if (data.type === "presentation_mode") {
      console.log("[EkhoBridge] Starting Presentation Mode (from GPIO)");
      if (typeof window.EkhoStartPresentation === "function") {
        window.EkhoStartPresentation();
      } else {
        console.warn(
          "[EkhoBridge] window.EkhoStartPresentation is not defined yet"
        );
      }
    }
  };

  evtSrc.onerror = (err) => {
    console.error("[EkhoBridge] SSE connection error:", err);
  };
})();
