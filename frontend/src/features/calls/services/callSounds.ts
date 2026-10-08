import { Audio } from "expo-av";
import { Vibration, Platform } from "react-native";

// Static asset requirements
const RINGTONE_ASSET = require("@/../assets/sounds/ringtone.wav");
const RINGBACK_ASSET = require("@/../assets/sounds/ringback.wav");
const CALL_END_ASSET = require("@/../assets/sounds/call_end.wav");
const BUSY_ASSET = require("@/../assets/sounds/busy.wav");

class CallSoundManager {
  private currentSound: Audio.Sound | null = null;
  private isVibrating = false;

  private async prepareAudioMode(speaker = true): Promise<void> {
    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: !speaker,
      });
    } catch {
      // Audio mode fallback non-fatal
    }
  }

  /**
   * Play continuous incoming call ringtone with rhythmic vibration
   */
  async playRingtone(): Promise<void> {
    await this.stopAll();
    await this.prepareAudioMode(true);

    try {
      const { sound } = await Audio.Sound.createAsync(
        RINGTONE_ASSET,
        {
          isLooping: true,
          volume: 1.0,
          shouldPlay: true,
        },
      );
      this.currentSound = sound;

      // Start looping vibration: wait 0ms, vibrate 1000ms, pause 1000ms
      if (Platform.OS !== "web") {
        Vibration.vibrate([0, 1000, 1000], true);
        this.isVibrating = true;
      }
    } catch (err) {
      console.warn("Could not play incoming ringtone:", err);
    }
  }

  /**
   * Play standard outgoing ringback tone while caller waits for answer
   */
  async playRingback(): Promise<void> {
    await this.stopAll();
    await this.prepareAudioMode(false);

    try {
      const { sound } = await Audio.Sound.createAsync(
        RINGBACK_ASSET,
        {
          isLooping: true,
          volume: 0.85,
          shouldPlay: true,
        },
      );
      this.currentSound = sound;
    } catch (err) {
      console.warn("Could not play ringback tone:", err);
    }
  }

  /**
   * Play short call-end / disconnect tone
   */
  async playCallEnd(): Promise<void> {
    await this.stopAll();

    try {
      const { sound } = await Audio.Sound.createAsync(
        CALL_END_ASSET,
        {
          isLooping: false,
          volume: 0.8,
          shouldPlay: true,
        },
      );
      this.currentSound = sound;
      // Auto-unload after completion
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (this.currentSound === sound) {
            this.currentSound = null;
          }
        }
      });
    } catch (err) {
      console.warn("Could not play call end tone:", err);
    }
  }

  /**
   * Play busy tone (e.g., when callee is on another call)
   */
  async playBusy(): Promise<void> {
    await this.stopAll();

    try {
      const { sound } = await Audio.Sound.createAsync(
        BUSY_ASSET,
        {
          isLooping: false,
          volume: 0.8,
          shouldPlay: true,
        },
      );
      this.currentSound = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync().catch(() => {});
          if (this.currentSound === sound) {
            this.currentSound = null;
          }
        }
      });
    } catch (err) {
      console.warn("Could not play busy tone:", err);
    }
  }

  /**
   * Instantly stop all playing call sounds and cancel vibration
   */
  async stopAll(): Promise<void> {
    if (this.isVibrating && Platform.OS !== "web") {
      Vibration.cancel();
      this.isVibrating = false;
    }

    if (this.currentSound) {
      try {
        await this.currentSound.stopAsync();
        await this.currentSound.unloadAsync();
      } catch {
        // Non-fatal
      }
      this.currentSound = null;
    }
  }
}

export const callSounds = new CallSoundManager();
