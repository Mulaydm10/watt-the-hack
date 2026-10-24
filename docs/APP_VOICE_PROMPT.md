# Message for the Claude building the phone app: live voice call with live captions

Replace the current push-to-talk / turn-taking voice mode with a **live call**: full-duplex audio (the caller can
interrupt), and live captions for both sides. Same agent, same brain: ElevenLabs does speech in/out and turn-taking;
our orchestrator (custom LLM) answers, so the guard, the engine numbers, the language following (de/en/fr/it/es/nl/pl/pt)
and the "one moment" filler all apply unchanged. The backend side is done (commit d56a99d).

## What changes in the app
1. **Never put the ElevenLabs API key in the app.** Before each call:
   `GET {API_BASE}/voice/signed-url` → `{ signed_url, agent_id, expires_in_s, audio }`. Use it within a few minutes.
2. Open a WebSocket to `signed_url` (e.g. `web_socket_channel`).
3. Immediately send the initiation message with the app's session id, so the call **continues the same session**
   as the typed chat (same answers, same `/sessions/{id}/result`):
   ```json
   {"type":"conversation_initiation_client_data","dynamic_variables":{"hpr_session":"<the app session_id from POST /sessions>"}}
   ```
   (No session yet? Create one first with `POST /sessions {"channel":"voice","lang":"de"}`; otherwise send `"none"`.)
4. **Microphone → server:** 16 kHz, mono, 16-bit PCM. Every ~100–250 ms send
   `{"user_audio_chunk":"<base64 PCM16 bytes>"}`.
   Use an audio source/session with **echo cancellation** (Android `VOICE_COMMUNICATION`; e.g. `record` with
   `AudioSource.voiceCommunication` + `audio_session` configured for voice chat), otherwise the agent hears itself.
5. **Server → app events** (log every raw event once and confirm the field names against ElevenLabs' current
   Agents WebSocket docs; these are the documented shapes as we understand them):
   | type | payload | what to do |
   |---|---|---|
   | `conversation_initiation_metadata` | `conversation_initiation_metadata_event.{conversation_id, agent_output_audio_format, user_input_audio_format}` | store conversation_id; both formats are `pcm_16000` on our agent |
   | `audio` | `audio_event.{audio_base_64, event_id}` | decode PCM16 16 kHz mono, queue for playback in order |
   | `interruption` | `interruption_event.{event_id}` | the caller talked over the agent: **stop playback now** and drop queued audio up to that event_id |
   | `tentative_user_transcript` | `tentative_user_transcription_event.user_transcript` | live caption of the caller, still changing (grey/italic) |
   | `user_transcript` | `user_transcription_event.user_transcript` | final caller line: replace the tentative one |
   | `internal_tentative_agent_response` | `tentative_agent_response_internal_event.tentative_agent_response` | agent text as it streams (optional) |
   | `agent_response` | `agent_response_event.agent_response` | final agent line in the transcript |
   | `agent_response_correction` | `agent_response_correction_event.{original_agent_response, corrected_agent_response}` | after an interruption: replace the agent line with what was actually said |
   | `vad_score` | `vad_score_event.vad_score` (0–1) | drive a "listening" level meter |
   | `ping` | `ping_event.{event_id, ping_ms}` | reply `{"type":"pong","event_id":<same>}` (required, or the call drops) |
   | `agent_tool_response` | tool name (e.g. `language_detection`) | optional: show "switched to Français" |
6. **End of call:** close the socket on "Hang up". When the conversation reaches the result (or after hang-up), call
   `GET {API_BASE}/sessions/{session_id}/result` and show the normal result screen. Poll `GET /sessions/{id}` if you
   want to show progress during the call (`state`, `progress`).

## Call screen (design)
- Large live captions: caller lines right, assistant lines left; tentative text in a lighter style that firms up
  when final. Auto-scroll; keep the last ~6 lines readable at 20 sp+.
- A pulsing "listening" ring driven by `vad_score`; a speaking indicator while agent audio plays.
- Buttons: **Hang up** (big, red, always visible), **Mute**, **Speaker**, **Switch to typing** (same session).
- Show the current language (follows the caller automatically) and the progress label.
- German first; English and the other languages follow the caller.
- Permissions: `RECORD_AUDIO` (+ `MODIFY_AUDIO_SETTINGS`); explain why before asking.
- Keep the scripted Demo mode as the offline fallback; if `/voice/signed-url` fails (503/502 or no network),
  offer typing instead.

## Done when
- A call to the B-04 house by voice ends yellow, ~9.5 kW, and the result screen opens for the same session.
- Interrupting the assistant stops its audio within ~200 ms and the transcript shows the corrected line.
- Live captions appear while the caller is still speaking.
- Speaking French mid-call switches the assistant (and its captions) to French.
- No ElevenLabs key in the APK (`grep` the build output).
- Maestro: open call screen → mic permission → hang up (audio itself can't be automated; test the UI states).

Backend lane (`services/`, `packages/agent`) is the owner's; ask there for changes.
