import { Platform } from "react-native";
import * as Font from "expo-font";

export interface IconFontDefinition {
  families: string[];
  file: string;
}

export const ICON_FONT_DEFINITIONS: IconFontDefinition[] = [
  {
    families: ["material-community", "MaterialCommunityIcons", "Material Design Icons"],
    file: "MaterialCommunityIcons.ttf",
  },
  {
    families: ["ionicons", "Ionicons"],
    file: "Ionicons.ttf",
  },
  {
    families: ["feather", "Feather"],
    file: "Feather.ttf",
  },
  {
    families: ["material", "MaterialIcons"],
    file: "MaterialIcons.ttf",
  },
  {
    families: ["FontAwesome"],
    file: "FontAwesome.ttf",
  },
  {
    families: ["FontAwesome5Free-Solid"],
    file: "FontAwesome5_Solid.ttf",
  },
  {
    families: ["FontAwesome5Free-Regular"],
    file: "FontAwesome5_Regular.ttf",
  },
  {
    families: ["FontAwesome5Brands-Regular"],
    file: "FontAwesome5_Brands.ttf",
  },
  {
    families: ["FontAwesome6Free-Solid"],
    file: "FontAwesome6_Solid.ttf",
  },
  {
    families: ["FontAwesome6Free-Regular"],
    file: "FontAwesome6_Regular.ttf",
  },
  {
    families: ["FontAwesome6Brands-Regular"],
    file: "FontAwesome6_Brands.ttf",
  },
  {
    families: ["anticon", "AntDesign"],
    file: "AntDesign.ttf",
  },
  {
    families: ["entypo", "Entypo"],
    file: "Entypo.ttf",
  },
  {
    families: ["EvilIcons"],
    file: "EvilIcons.ttf",
  },
  {
    families: ["Fontisto"],
    file: "Fontisto.ttf",
  },
  {
    families: ["Foundation", "font-awesome"],
    file: "Foundation.ttf",
  },
  {
    families: ["octicons", "Octicons"],
    file: "Octicons.ttf",
  },
  {
    families: ["simple-line-icons", "SimpleLineIcons"],
    file: "SimpleLineIcons.ttf",
  },
  {
    families: ["zocial", "Zocial"],
    file: "Zocial.ttf",
  },
];

export const ALL_ICON_FAMILIES = new Set<string>();
ICON_FONT_DEFINITIONS.forEach((def) => {
  def.families.forEach((fam) => ALL_ICON_FAMILIES.add(fam));
});

export const CDN_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@expo/vector-icons@15.0.2/build/vendor/react-native-vector-icons/Fonts/";

export function generateWebIconCss(): string {
  const cssRules: string[] = [];
  ICON_FONT_DEFINITIONS.forEach(({ families, file }) => {
    const localUrl = `/fonts/${file}`;
    const cdnUrl = `${CDN_BASE_URL}${file}`;
    families.forEach((family) => {
      cssRules.push(`@font-face {
  font-family: '${family}';
  src: url('${localUrl}') format('truetype'),
       url('${cdnUrl}') format('truetype');
  font-display: swap;
}`);
      if (!family.includes(" ")) {
        cssRules.push(`@font-face {
  font-family: ${family};
  src: url('${localUrl}') format('truetype'),
       url('${cdnUrl}') format('truetype');
  font-display: swap;
}`);
      }
    });
  });
  return cssRules.join("\n");
}

export function initWebIcons(): void {
  if (Platform.OS !== "web") return;

  // 1. Monkey-patch Font.isLoaded so that vector icons render immediately
  // and never trigger FontObserver or return empty text.
  try {
    const origIsLoaded = Font.isLoaded;
    (Font as any).isLoaded = (fontFamily: string) => {
      if (ALL_ICON_FAMILIES.has(fontFamily)) {
        return true;
      }
      return origIsLoaded ? origIsLoaded(fontFamily) : false;
    };

    const origLoadAsync = Font.loadAsync;
    (Font as any).loadAsync = async (fontFamilyOrFontMap: any, source?: any) => {
      if (typeof fontFamilyOrFontMap === "string" && ALL_ICON_FAMILIES.has(fontFamilyOrFontMap)) {
        return;
      }
      if (typeof fontFamilyOrFontMap === "object" && fontFamilyOrFontMap !== null) {
        const remaining: Record<string, any> = {};
        let hasRemaining = false;
        for (const [key, val] of Object.entries(fontFamilyOrFontMap)) {
          if (!ALL_ICON_FAMILIES.has(key)) {
            remaining[key] = val;
            hasRemaining = true;
          }
        }
        if (!hasRemaining) return;
        return origLoadAsync(remaining, source);
      }
      return origLoadAsync(fontFamilyOrFontMap, source);
    };
  } catch {}

  // 2. Inject CSS rules into document
  if (typeof document !== "undefined") {
    const fullCss = generateWebIconCss();

    // Populate <style id="expo-generated-fonts"> so Expo's internal style sheet check sees the fonts
    let expoStyle = document.getElementById("expo-generated-fonts") as HTMLStyleElement | null;
    if (!expoStyle) {
      expoStyle = document.createElement("style");
      expoStyle.id = "expo-generated-fonts";
      document.head.appendChild(expoStyle);
    }
    if (!expoStyle.textContent?.includes("material-community")) {
      expoStyle.textContent = (expoStyle.textContent || "") + "\n" + fullCss;
    }

    // Also populate dedicated skillbridge-web-icons style element
    let sbStyle = document.getElementById("skillbridge-web-icons") as HTMLStyleElement | null;
    if (!sbStyle) {
      sbStyle = document.createElement("style");
      sbStyle.id = "skillbridge-web-icons";
      sbStyle.textContent = fullCss;
      document.head.appendChild(sbStyle);
    }

    // 3. Register native FontFace objects in document.fonts
    if (typeof FontFace !== "undefined" && typeof document.fonts !== "undefined") {
      ICON_FONT_DEFINITIONS.forEach(({ families, file }) => {
        const localUrl = `/fonts/${file}`;
        const cdnUrl = `${CDN_BASE_URL}${file}`;
        const srcDesc = `url('${localUrl}') format('truetype'), url('${cdnUrl}') format('truetype')`;
        families.forEach((fam) => {
          try {
            const fontFace = new FontFace(fam, srcDesc, { display: "swap" });
            fontFace
              .load()
              .then((loaded) => {
                document.fonts.add(loaded);
              })
              .catch(() => {});
          } catch {}
        });
      });
    }
  }
}

// Auto-run immediately when this module is imported
initWebIcons();
