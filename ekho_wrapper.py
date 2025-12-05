#!/usr/bin/env python3
# ekho_wrapper.py — GPIO → Realtime Console bridge for Ekho (with HTTP control + presentation mode)

import requests
import time
import subprocess
import threading
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from gpiozero import Button, LED
from signal import pause

# ---------------------------
# GPIO pin setup
# ---------------------------
GREEN_BTN = 23
YELLOW_BTN = 24
RED_BTN = 6          # NEW red button

GREEN_LED = 17
YELLOW_LED = 22
RED_LED = 5          # NEW red LED

API_URL = "http://localhost:3000/ekho/emit"   # SSE → browser (unchanged)
HTTP_PORT = 7000                              # Browser → wrapper HTTP control

# Buttons
green_btn = Button(GREEN_BTN, bounce_time=0.2, hold_time=2)
yellow_btn = Button(YELLOW_BTN, bounce_time=0.2)
red_btn = Button(RED_BTN, bounce_time=0.2, hold_time=2)

# LEDs
green_led = LED(GREEN_LED)
yellow_led = LED(YELLOW_LED)
red_led = LED(RED_LED)

# ---------------------------
# INITIAL LED STATE
# ---------------------------
# Red ON while system is booting / not ready
red_led.on()
green_led.off()
yellow_led.off()

print("👋 Ekho Wrapper ready with Presentation Mode + HTTP control")
print("🟢 GREEN = start/unpause session")
print("🟡 YELLOW (single) = pause session")
print("🟡 YELLOW (double) = presentation mode")
print("🔴 RED tap = disconnect, hold = shutdown")

# ---------------------------
# Helper to send events → Node SSE
# ---------------------------
def send_event(event_type):
  try:
    res = requests.post(API_URL, json={"type": event_type})
    print(f"[EkhoWrapper] Sent event '{event_type}' ({res.status_code})")
  except Exception as e:
    print(f"[EkhoWrapper] Failed to send '{event_type}':", e)

# ---------------------------
# HTTP server (browser → wrapper)
# POST http://localhost:7000/state { "type": "session_ready" }
# ---------------------------
class EkhoHTTPHandler(BaseHTTPRequestHandler):
  def log_message(self, format, *args):
    # Silence default HTTP logging
    return

  def do_POST(self):
    if self.path != "/state":
      self.send_response(404)
      self.end_headers()
      return

    length = int(self.headers.get("Content-Length", "0") or "0")
    raw = self.rfile.read(length) if length > 0 else b"{}"

    try:
      data = json.loads(raw.decode("utf-8"))
    except Exception:
      data = {}

    state_type = data.get("type")
    print(f"[EkhoWrapper] HTTP /state: {state_type}")

    if state_type == "session_ready":
      # Realtime console is connected and ready to interact
      red_led.off()
      yellow_led.off()
      green_led.on()   # solid green = ready / idle

    elif state_type == "session_stopped":
      # Back to idle after disconnect
      yellow_led.off()
      red_led.off()
      green_led.on()

    # Reply OK
    self.send_response(200)
    self.send_header("Content-Type", "application/json")
    self.end_headers()
    self.wfile.write(b'{"ok": true}')

def start_http_server():
  server = HTTPServer(("0.0.0.0", HTTP_PORT), EkhoHTTPHandler)
  print(f"[EkhoWrapper] HTTP control server listening on port {HTTP_PORT}")
  server.serve_forever()

# Start HTTP control server in background
threading.Thread(target=start_http_server, daemon=True).start()

# ---------------------------
# GREEN BUTTON
# ---------------------------
def on_green_press():
  print("🟢 GREEN → start/unpause")

  yellow_led.off()
  # Blink green while session is active / talking
  green_led.blink(on_time=0.3, off_time=0.3)
  send_event("start_or_unpause")

green_btn.when_pressed = on_green_press

# ---------------------------
# YELLOW BUTTON: pause OR presentation mode (double tap)
# ---------------------------
last_yellow_time = 0

def on_yellow_press():
  global last_yellow_time

  now = time.time()
  dt = now - last_yellow_time
  last_yellow_time = now

  if dt < 0.5:
    # DOUBLE PRESS = PRESENTATION MODE
    print("🟡 YELLOW double-press → Presentation Mode")
    yellow_led.blink(on_time=0.1, off_time=0.1)
    send_event("presentation_mode")
    return

  # SINGLE PRESS = PAUSE
  print("🟡 YELLOW single press → pause")
  green_led.off()
  yellow_led.blink(on_time=0.3, off_time=0.3)
  send_event("pause")

yellow_btn.when_pressed = on_yellow_press

# ---------------------------
# RED BUTTON
# ---------------------------
def on_red_press():
  print("🔴 RED → disconnect")
  yellow_led.off()
  green_led.on()      # back to solid "ready"
  send_event("disconnect")

def on_red_hold():
  print("🛑 RED held → shutdown")
  red_led.on()
  green_led.off()
  yellow_led.off()
  time.sleep(0.5)
  subprocess.run(["sudo", "shutdown", "-h", "now"])

red_btn.when_pressed = on_red_press
red_btn.when_held = on_red_hold

# Block forever, letting GPIO callbacks + HTTP server run
pause()
