import React, { useState, useRef, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { WebView } from "react-native-webview";
import { useTheme } from "@/theme";
import { triggerHaptic } from "@/components/ui";

export interface FullScreenPdfReaderProps {
  visible: boolean;
  url: string;
  title: string;
  uploaderName?: string;
  department?: string | null;
  courseCode?: string | null;
  fileSizeBytes?: number;
  onClose: () => void;
  onShare?: () => void;
}

type ReaderTheme = "normal" | "dark" | "sepia";
type ReaderEngine = "pdfjs" | "gdocs";

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "PDF Doc";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FullScreenPdfReader({
  visible,
  url,
  title,
  uploaderName,
  department,
  courseCode,
  fileSizeBytes,
  onClose,
  onShare,
}: FullScreenPdfReaderProps) {
  const { colors, isDark } = useTheme();
  const webViewRef = useRef<WebView>(null);

  // Reader state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [themeMode, setThemeMode] = useState<ReaderTheme>(isDark ? "dark" : "normal");
  const [engine, setEngine] = useState<ReaderEngine>("pdfjs");
  const [zoomLevel, setZoomLevel] = useState<number>(100);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [showJumpModal, setShowJumpModal] = useState(false);
  const [jumpPageText, setJumpPageText] = useState("");
  const [pageInfo, setPageInfo] = useState<{ current: number; total: number }>({
    current: 1,
    total: 1,
  });

  // Reset loading and page info whenever URL or engine changes
  useEffect(() => {
    if (visible) {
      setIsLoading(true);
      setZoomLevel(100);
      setPageInfo({ current: 1, total: 1 });
    }
  }, [visible, url, engine]);

  if (!visible || !url) return null;

  // Build viewer URL
  // For PDF.js: use a self-contained inline HTML viewer to avoid cross-origin
  // restrictions from Mozilla's hosted pdf.js which blocks external file URLs.
  // Google Docs viewer is used as a fallback engine.
  const encodedUrl = encodeURIComponent(url);
  const gdocsViewerUrl = `https://docs.google.com/viewer?embedded=true&url=${encodedUrl}`;

  // Self-hosted inline PDF.js viewer HTML – avoids cross-origin block from
  // mozilla.github.io which only allows files hosted on that same origin.
  const pdfJsInlineHtml = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=yes">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: #fff; overflow: hidden; }
  #pdf-container {
    width: 100%; height: 100%; overflow-y: auto; overflow-x: hidden;
    display: flex; flex-direction: column; align-items: center;
    padding: 10px 0;
  }
  canvas { display: block; margin: 6px auto; box-shadow: 0 1px 6px rgba(0,0,0,0.18); }
  #status {
    position: fixed; top: 50%; left: 50%; transform: translate(-50%,-50%);
    font-family: sans-serif; font-size: 15px; color: #444; text-align: center;
  }
  #error { color: #c00; font-family: sans-serif; padding: 20px; text-align: center; }
</style>
</head>
<body>
<div id="status">Loading PDF\u2026</div>
<div id="pdf-container"></div>
<script src="https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js"></script>
<script>
(function() {
  var pdfUrl = ${JSON.stringify(url)};
  var container = document.getElementById('pdf-container');
  var statusEl = document.getElementById('status');

  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';

  pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise.then(function(pdf) {
    statusEl.style.display = 'none';
    var totalPages = pdf.numPages;

    // Notify RN with total pages
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'pageChange', page: 1, total: totalPages
      }));
    }

    // Render pages sequentially
    function renderPage(num) {
      pdf.getPage(num).then(function(page) {
        var viewport = page.getViewport({ scale: window.devicePixelRatio > 1 ? 1.8 : 1.5 });
        var canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = Math.min(viewport.width, window.innerWidth - 20) + 'px';
        canvas.style.height = 'auto';
        container.appendChild(canvas);
        var ctx = canvas.getContext('2d');
        page.render({ canvasContext: ctx, viewport: viewport }).promise.then(function() {
          if (num < totalPages) renderPage(num + 1);
        });
      });
    }
    renderPage(1);

    // Track scroll-based current page
    container.addEventListener('scroll', function() {
      var canvases = container.querySelectorAll('canvas');
      var scrollTop = container.scrollTop;
      var approxPage = Math.floor(scrollTop / (container.scrollHeight / totalPages)) + 1;
      approxPage = Math.max(1, Math.min(approxPage, totalPages));
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'pageChange', page: approxPage, total: totalPages
        }));
      }
    });
  }).catch(function(err) {
    statusEl.style.display = 'none';
    container.innerHTML = '<div id="error">Could not load PDF.<br><small>' + err.message + '</small></div>';
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: err.message }));
    }
  });
})();
</script>
</body>
</html>`;

  const activeViewerUrl = engine === "gdocs" ? gdocsViewerUrl : "";

  // CSS injection for Night / Dark Mode and Sepia eye care
  const themeFilterCss =
    themeMode === "dark"
      ? "filter: invert(0.9) hue-rotate(180deg) brightness(0.95) contrast(1.1) !important; background-color: #121212 !important;"
      : themeMode === "sepia"
      ? "filter: sepia(0.4) contrast(0.95) brightness(0.95) !important; background-color: #fbf0d9 !important;"
      : "filter: none !important; background-color: #ffffff !important;";

  const injectedJavaScript = `
    (function() {
      // Apply reader theme to canvas and body
      var style = document.getElementById('sb-theme-style');
      if (!style) {
        style = document.createElement('style');
        style.id = 'sb-theme-style';
        document.head.appendChild(style);
      }
      style.innerHTML = \`
        body, #viewerContainer, .pdfViewer { \${${JSON.stringify(themeFilterCss)}} }
        #toolbarContainer, #toolbarViewer { opacity: 0.95; }
      \`;

      // Intercept page changes if PDF.js is active
      if (window.PDFViewerApplication) {
        window.PDFViewerApplication.initializedPromise.then(function() {
          window.PDFViewerApplication.eventBus.on('pagechanging', function(evt) {
            window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'pageChange',
              page: evt.pageNumber,
              total: window.PDFViewerApplication.pagesCount
            }));
          });
        });
      }
      true;
    })();
  `;

  // Zoom manipulation in WebView
  const handleZoomIn = () => {
    triggerHaptic();
    const newZoom = Math.min(zoomLevel + 25, 250);
    setZoomLevel(newZoom);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        var scale = ${newZoom / 100};
        // canvas-based inline viewer
        var container = document.getElementById('pdf-container');
        if (container) {
          container.style.transform = 'scale(' + scale + ')';
          container.style.transformOrigin = 'top center';
        } else if (window.PDFViewerApplication) {
          window.PDFViewerApplication.zoomIn();
        } else {
          document.body.style.zoom = '${newZoom / 100}';
        }
        true;
      `);
    }
  };

  const handleZoomOut = () => {
    triggerHaptic();
    const newZoom = Math.max(zoomLevel - 25, 50);
    setZoomLevel(newZoom);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        var scale = ${newZoom / 100};
        var container = document.getElementById('pdf-container');
        if (container) {
          container.style.transform = 'scale(' + scale + ')';
          container.style.transformOrigin = 'top center';
        } else if (window.PDFViewerApplication) {
          window.PDFViewerApplication.zoomOut();
        } else {
          document.body.style.zoom = '${newZoom / 100}';
        }
        true;
      `);
    }
  };

  const handleResetZoom = () => {
    triggerHaptic();
    setZoomLevel(100);
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        var container = document.getElementById('pdf-container');
        if (container) {
          container.style.transform = 'scale(1)';
        } else if (window.PDFViewerApplication) {
          window.PDFViewerApplication.pdfViewer.currentScaleValue = 'page-width';
        } else {
          document.body.style.zoom = '1.0';
        }
        true;
      `);
    }
  };

  // Next / Prev Page
  const handleNextPage = () => {
    triggerHaptic();
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.PDFViewerApplication) {
          window.PDFViewerApplication.page++;
        }
        true;
      `);
    }
  };

  const handlePrevPage = () => {
    triggerHaptic();
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.PDFViewerApplication) {
          window.PDFViewerApplication.page--;
        }
        true;
      `);
    }
  };

  // Jump to specific page
  const handleJumpSubmit = () => {
    const pageNum = parseInt(jumpPageText.trim(), 10);
    if (isNaN(pageNum) || pageNum < 1) {
      Alert.alert("Invalid Page", "Please enter a valid page number.");
      return;
    }
    triggerHaptic();
    setShowJumpModal(false);
    setJumpPageText("");
    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        if (window.PDFViewerApplication) {
          window.PDFViewerApplication.page = ${pageNum};
        }
        true;
      `);
    }
  };

  // Cycle reading theme: Normal -> Dark -> Sepia
  const cycleTheme = () => {
    triggerHaptic();
    const nextTheme: ReaderTheme =
      themeMode === "normal" ? "dark" : themeMode === "dark" ? "sepia" : "normal";
    setThemeMode(nextTheme);

    const nextCss =
      nextTheme === "dark"
        ? "filter: invert(0.9) hue-rotate(180deg) brightness(0.95) contrast(1.1) !important; background-color: #121212 !important;"
        : nextTheme === "sepia"
        ? "filter: sepia(0.4) contrast(0.95) brightness(0.95) !important; background-color: #fbf0d9 !important;"
        : "filter: none !important; background-color: #ffffff !important;";

    if (webViewRef.current) {
      webViewRef.current.injectJavaScript(`
        var style = document.getElementById('sb-theme-style');
        if (style) {
          style.innerHTML = \`
            body, #viewerContainer, .pdfViewer { ${nextCss} }
          \`;
        }
        true;
      `);
    }
  };

  // Share note link
  const handleShare = async () => {
    triggerHaptic();
    if (onShare) {
      onShare();
      return;
    }
    try {
      await Share.share({
        title,
        message: `Read "${title}" on SkillBridge Academic Vault: ${url}`,
        url,
      });
    } catch (err: any) {
      console.warn("Share failed:", err);
    }
  };

  // Copy link
  const handleCopyLink = async () => {
    triggerHaptic();
    await Clipboard.setStringAsync(url);
    Alert.alert("Link Copied", "PDF direct Cloudflare R2 link copied to clipboard.");
  };

  // Download & Save Offline
  const handleDownloadOffline = async () => {
    triggerHaptic();
    if (Platform.OS === "web") {
      window.open(url, "_blank");
      return;
    }

    try {
      setIsDownloading(true);
      setDownloadProgress(0);

      const safeName = (title.replace(/[^a-zA-Z0-9_-]/g, "_") || "document") + ".pdf";
      const fileUri = `${(FileSystem as any).documentDirectory || ""}${safeName}`;

      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        fileUri,
        {},
        (progress) => {
          const percent = progress.totalBytesWritten / progress.totalBytesExpectedToWrite;
          setDownloadProgress(Math.round(percent * 100));
        },
      );

      const downloadResult = await downloadResumable.downloadAsync();
      setIsDownloading(false);

      if (downloadResult?.uri) {
        triggerHaptic();
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: "application/pdf",
            dialogTitle: `Save or Open ${title}`,
            UTI: "com.adobe.pdf",
          });
        } else {
          Alert.alert("Download Complete", `PDF saved to offline storage:\n${downloadResult.uri}`);
        }
      }
    } catch (err: any) {
      setIsDownloading(false);
      Alert.alert("Download Error", err.message || "Failed downloading PDF.");
    }
  };

  // Open in system browser or external app
  const handleOpenExternal = async () => {
    triggerHaptic();
    try {
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.FULL_SCREEN,
        readerMode: true,
      });
    } catch {
      Alert.alert("Viewer Error", "Could not open external viewer.");
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      presentationStyle="fullScreen"
      hardwareAccelerated
      onRequestClose={onClose}
    >
      <StatusBar
        hidden={isFullscreen}
        barStyle={isDark || themeMode === "dark" ? "light-content" : "dark-content"}
        backgroundColor={colors.surface}
      />

      <View
        style={[
          styles.container,
          {
            backgroundColor:
              themeMode === "dark"
                ? "#09090b"
                : themeMode === "sepia"
                ? "#f7ebd2"
                : colors.background,
          },
        ]}
      >
        {/* TOP HEADER BAR (Hides in fullscreen mode) */}
        {!isFullscreen && (
          <View
            style={[
              styles.headerBar,
              {
                backgroundColor: colors.surface,
                borderBottomColor: colors.border,
              },
            ]}
          >
            {/* Left: Back button & Title */}
            <View style={styles.headerLeft}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  onClose();
                }}
                hitSlop={12}
                style={[
                  styles.roundBtn,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color={colors.text} />
              </Pressable>

              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
                  {title}
                </Text>
                <Text style={[styles.headerMeta, { color: colors.muted }]} numberOfLines={1}>
                  {[courseCode, department, formatBytes(fileSizeBytes), uploaderName]
                    .filter(Boolean)
                    .join(" • ")}
                </Text>
              </View>
            </View>

            {/* Right: Quick actions */}
            <View style={styles.headerRight}>
              {/* Theme Toggle */}
              <Pressable
                onPress={cycleTheme}
                hitSlop={8}
                style={[
                  styles.actionPill,
                  {
                    backgroundColor:
                      themeMode === "dark"
                        ? "#1e293b"
                        : themeMode === "sepia"
                        ? "#fef3c7"
                        : colors.background,
                    borderColor: colors.border,
                  },
                ]}
                accessibilityLabel="Switch Reading Theme"
              >
                <MaterialCommunityIcons
                  name={
                    themeMode === "dark"
                      ? "weather-night"
                      : themeMode === "sepia"
                      ? "book-open-page-variant"
                      : "weather-sunny"
                  }
                  size={16}
                  color={
                    themeMode === "dark" ? "#38bdf8" : themeMode === "sepia" ? "#b45309" : "#f59e0b"
                  }
                />
                <Text
                  style={[
                    styles.actionPillText,
                    {
                      color:
                        themeMode === "dark"
                          ? "#38bdf8"
                          : themeMode === "sepia"
                          ? "#b45309"
                          : colors.text,
                    },
                  ]}
                >
                  {themeMode === "dark" ? "Dark" : themeMode === "sepia" ? "Sepia" : "Light"}
                </Text>
              </Pressable>

              {/* Fullscreen Toggle */}
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setIsFullscreen(true);
                }}
                hitSlop={8}
                style={[
                  styles.roundBtn,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
                accessibilityLabel="Enter Fullscreen"
              >
                <MaterialCommunityIcons name="fullscreen" size={20} color={colors.text} />
              </Pressable>

              {/* Share Sheet */}
              <Pressable
                onPress={handleShare}
                hitSlop={8}
                style={[
                  styles.roundBtn,
                  { backgroundColor: colors.background, borderColor: colors.border },
                ]}
              >
                <MaterialCommunityIcons name="share-variant-outline" size={18} color={colors.text} />
              </Pressable>

              {/* Download Offline */}
              <Pressable
                onPress={handleDownloadOffline}
                hitSlop={8}
                style={[
                  styles.roundBtn,
                  { backgroundColor: colors.primary, borderColor: colors.primary },
                ]}
              >
                <MaterialCommunityIcons name="download" size={18} color="#fff" />
              </Pressable>
            </View>
          </View>
        )}

        {/* SECONDARY ENGINE SWITCHER BAR */}
        {!isFullscreen && (
          <View
            style={[
              styles.subHeaderBar,
              { backgroundColor: colors.background, borderBottomColor: colors.border },
            ]}
          >
            <View style={styles.engineBadgeWrap}>
              <MaterialCommunityIcons name="cloud-check" size={14} color="#10B981" />
              <Text style={[styles.engineBadgeText, { color: colors.muted }]}>
                Cloudflare R2 • Ultra-Fast CDN
              </Text>
            </View>

            <View style={styles.engineSwitcher}>
              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setEngine("pdfjs");
                }}
                style={[
                  styles.engineTab,
                  engine === "pdfjs" && [
                    styles.engineTabActive,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.engineTabText,
                    { color: engine === "pdfjs" ? colors.primary : colors.muted },
                  ]}
                >
                  PDF.js Engine
                </Text>
              </Pressable>

              <Pressable
                onPress={() => {
                  triggerHaptic();
                  setEngine("gdocs");
                }}
                style={[
                  styles.engineTab,
                  engine === "gdocs" && [
                    styles.engineTabActive,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                  ],
                ]}
              >
                <Text
                  style={[
                    styles.engineTabText,
                    { color: engine === "gdocs" ? colors.primary : colors.muted },
                  ]}
                >
                  Google Viewer
                </Text>
              </Pressable>

              <Pressable
                onPress={handleOpenExternal}
                style={styles.engineTab}
                hitSlop={6}
              >
                <MaterialCommunityIcons name="open-in-new" size={13} color={colors.muted} />
              </Pressable>
            </View>
          </View>
        )}

        {/* MAIN VIEWER CANVAS */}
        <View style={styles.viewerWrapper}>
          {Platform.OS === "web" ? (
            // Web In-App iframe – use Google Docs for cross-origin PDFs on web
            <View style={{ flex: 1, width: "100%", height: "100%" }}>
              {/* @ts-ignore - web iframe */}
              <iframe
                src={engine === "gdocs" ? gdocsViewerUrl : `https://mozilla.github.io/pdf.js/web/viewer.html?file=${encodedUrl}`}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  filter:
                    themeMode === "dark"
                      ? "invert(0.9) hue-rotate(180deg) brightness(0.95)"
                      : themeMode === "sepia"
                      ? "sepia(0.4) contrast(0.95)"
                      : "none",
                }}
                title={title}
                onLoad={() => setIsLoading(false)}
              />
            </View>
          ) : engine === "pdfjs" ? (
            // Native: Inline self-hosted PDF.js (avoids cross-origin block)
            <WebView
              ref={webViewRef}
              source={{ html: pdfJsInlineHtml, baseUrl: "https://cdn.jsdelivr.net" }}
              style={[
                styles.webView,
                {
                  backgroundColor:
                    themeMode === "dark"
                      ? "#121212"
                      : themeMode === "sepia"
                      ? "#fbf0d9"
                      : "#ffffff",
                },
              ]}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              allowFileAccess
              allowUniversalAccessFromFileURLs
              mixedContentMode="always"
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => setIsLoading(false)}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === "pageChange") {
                    setPageInfo({
                      current: data.page || 1,
                      total: data.total || 1,
                    });
                  }
                } catch {}
              }}
            />
          ) : (
            // Native: Google Docs viewer (fallback engine)
            <WebView
              ref={webViewRef}
              source={{ uri: gdocsViewerUrl }}
              style={[
                styles.webView,
                {
                  backgroundColor:
                    themeMode === "dark"
                      ? "#121212"
                      : themeMode === "sepia"
                      ? "#fbf0d9"
                      : "#ffffff",
                },
              ]}
              javaScriptEnabled
              domStorageEnabled
              startInLoadingState
              scalesPageToFit
              injectedJavaScript={injectedJavaScript}
              onLoadStart={() => setIsLoading(true)}
              onLoadEnd={() => {
                setIsLoading(false);
                webViewRef.current?.injectJavaScript(injectedJavaScript);
              }}
              onMessage={(event) => {
                try {
                  const data = JSON.parse(event.nativeEvent.data);
                  if (data.type === "pageChange") {
                    setPageInfo({
                      current: data.page || 1,
                      total: data.total || 1,
                    });
                  }
                } catch {}
              }}
            />
          )}

          {/* Loading Overlay */}
          {isLoading && (
            <View
              style={[
                styles.loaderOverlay,
                { backgroundColor: isDark ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.7)" },
              ]}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={[styles.loaderText, { color: colors.text }]}>
                Rendering Document Stream...
              </Text>
            </View>
          )}

          {/* Downloading Offline Progress Banner */}
          {isDownloading && (
            <View style={[styles.downloadBanner, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.downloadText, { color: colors.text }]}>
                Saving Offline: {downloadProgress}%
              </Text>
            </View>
          )}

          {/* FLOATING RESTORE FULLSCREEN BUTTON (When in fullscreen mode) */}
          {isFullscreen && (
            <Pressable
              onPress={() => {
                triggerHaptic();
                setIsFullscreen(false);
              }}
              style={[
                styles.exitFullscreenBtn,
                { backgroundColor: "rgba(15,23,42,0.85)", borderColor: "rgba(255,255,255,0.2)" },
              ]}
            >
              <MaterialCommunityIcons name="fullscreen-exit" size={20} color="#fff" />
              <Text style={styles.exitFullscreenText}>Exit Fullscreen</Text>
            </Pressable>
          )}
        </View>

        {/* BOTTOM FLOATING CONTROLS TOOLBAR */}
        <View
          style={[
            styles.bottomToolbar,
            {
              backgroundColor: colors.surface,
              borderTopColor: colors.border,
            },
            isFullscreen && styles.bottomToolbarHidden,
          ]}
        >
          {/* Zoom In & Out */}
          <View style={styles.toolbarGroup}>
            <Pressable
              onPress={handleZoomOut}
              hitSlop={8}
              style={[styles.toolBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="magnify-minus-outline" size={18} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={handleResetZoom}
              hitSlop={8}
              style={[styles.toolPillBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <Text style={[styles.zoomText, { color: colors.text }]}>{zoomLevel}%</Text>
            </Pressable>

            <Pressable
              onPress={handleZoomIn}
              hitSlop={8}
              style={[styles.toolBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="magnify-plus-outline" size={18} color={colors.text} />
            </Pressable>
          </View>

          {/* Page Indicator & Jump */}
          <Pressable
            onPress={() => {
              triggerHaptic();
              setShowJumpModal(true);
            }}
            style={[
              styles.pageIndicatorWrap,
              { backgroundColor: colors.background, borderColor: colors.border },
            ]}
          >
            <MaterialCommunityIcons name="file-document-outline" size={14} color={colors.primary} />
            <Text style={[styles.pageIndicatorText, { color: colors.text }]}>
              {pageInfo.total > 1 ? `Page ${pageInfo.current} / ${pageInfo.total}` : "Jump to Page"}
            </Text>
            <MaterialCommunityIcons name="menu-down" size={14} color={colors.muted} />
          </Pressable>

          {/* Navigation Arrows */}
          <View style={styles.toolbarGroup}>
            <Pressable
              onPress={handlePrevPage}
              hitSlop={8}
              style={[styles.toolBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={handleNextPage}
              hitSlop={8}
              style={[styles.toolBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="chevron-right" size={22} color={colors.text} />
            </Pressable>

            <Pressable
              onPress={handleCopyLink}
              hitSlop={8}
              style={[styles.toolBtn, { backgroundColor: colors.background, borderColor: colors.border }]}
            >
              <MaterialCommunityIcons name="link-variant" size={18} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {/* JUMP TO PAGE MODAL */}
        <Modal
          visible={showJumpModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowJumpModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[
                styles.modalContent,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.modalTitle, { color: colors.text }]}>Jump to Page</Text>
              <Text style={[styles.modalSub, { color: colors.muted }]}>
                Enter the page number you wish to navigate to:
              </Text>

              <TextInput
                value={jumpPageText}
                onChangeText={setJumpPageText}
                placeholder="e.g. 15"
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                autoFocus
                style={[
                  styles.modalInput,
                  { backgroundColor: colors.background, borderColor: colors.border, color: colors.text },
                ]}
              />

              <View style={styles.modalBtnRow}>
                <Pressable
                  onPress={() => setShowJumpModal(false)}
                  style={[styles.modalBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.modalBtnText, { color: colors.muted }]}>Cancel</Text>
                </Pressable>

                <Pressable
                  onPress={handleJumpSubmit}
                  style={[styles.modalBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}
                >
                  <Text style={[styles.modalBtnText, { color: "#fff", fontWeight: "600" }]}>
                    Go to Page
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  headerBar: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  headerLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  headerMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  subHeaderBar: {
    height: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 9,
  },
  engineBadgeWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  engineBadgeText: {
    fontSize: 11,
    fontWeight: "500",
  },
  engineSwitcher: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  engineTab: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  engineTabActive: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  engineTabText: {
    fontSize: 11,
    fontWeight: "600",
  },
  roundBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: "600",
  },
  viewerWrapper: {
    flex: 1,
    position: "relative",
    width: "100%",
    height: "100%",
  },
  webView: {
    flex: 1,
    width: "100%",
    height: "100%",
  },
  loaderOverlay: {
    ...(StyleSheet.absoluteFill as any),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 20,
    gap: 10,
  },
  loaderText: {
    fontSize: 13,
    fontWeight: "600",
  },
  downloadBanner: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 30,
  },
  downloadText: {
    fontSize: 12,
    fontWeight: "600",
  },
  exitFullscreenBtn: {
    position: "absolute",
    top: 16,
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    zIndex: 40,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  exitFullscreenText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  bottomToolbar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    zIndex: 10,
  },
  bottomToolbarHidden: {
    display: "none",
  },
  toolbarGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  toolBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  toolPillBtn: {
    paddingHorizontal: 8,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  zoomText: {
    fontSize: 11,
    fontWeight: "700",
  },
  pageIndicatorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    height: 34,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pageIndicatorText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalContent: {
    width: "100%",
    maxWidth: 320,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  modalSub: {
    fontSize: 12,
    marginBottom: 14,
  },
  modalInput: {
    height: 44,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 16,
  },
  modalBtnRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  modalBtnText: {
    fontSize: 13,
  },
});
