# =============================================================================
# SkillBridge release ProGuard / R8 rules
# Active only when android.enableMinifyInReleaseBuilds=true (gradle.properties).
# =============================================================================

# --- React Native core -------------------------------------------------------
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.proguard.** { *; }
-keep class com.facebook.soloader.** { *; }
-keep class com.facebook.imagepipeline.** { *; }
-dontwarn com.facebook.react.**
-dontwarn com.facebook.hermes.**
-dontwarn com.facebook.soloader.**

# TurboModules / Fabric / bridging (resolved via reflection + JNI)
-keep class com.facebook.react.bridge.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }
-keep class com.facebook.react.uimanager.** { *; }
-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers class * { @com.facebook.react.bridge.ReactMethod <methods>; }

# Keep native method holders and their names
-keepclasseswithmembernames class * { native <methods>; }

# --- react-native-reanimated -------------------------------------------------
-keep class com.swmansion.reanimated.** { *; }

# --- Expo modules (resolved reflectively) ------------------------------------
-keep class expo.modules.** { *; }
-dontwarn expo.modules.**

# --- LiveKit (native audio/video rooms) --------------------------------------
-keep class io.livekit.** { *; }
-keep class com.livekit.** { *; }
-keep class livekit.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn io.livekit.**
-dontwarn org.webrtc.**
-dontwarn com.google.protobuf.**

# --- react-native-maps -------------------------------------------------------
-keep class com.airbnb.android.react.maps.** { *; }
-dontwarn com.google.android.gms.**

# --- AsyncStorage ------------------------------------------------------------
-keep class com.reactnativeasyncstorage.** { *; }
-keep class com.facebook.react.modules.storage.** { *; }

# --- Networking (okhttp/okio used by Supabase, LiveKit, socket transport) ----
-keepattributes Signature, InnerClasses, EnclosingMethod, *Annotation*, Exception, SourceFile, LineNumberTable
-keep class com.google.gson.** { *; }
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
-dontwarn javax.annotation.**
-dontwarn java.lang.management.**

# Add any project specific keep options here:
