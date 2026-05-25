import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import type { ComponentProps } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import albumSectionsData from "../data/worldCup2026Stickers.json";

type IconName = ComponentProps<typeof Ionicons>["name"];
type StickerState = "missing" | "owned" | "duplicate";
type AlbumSection = {
  name: string;
  codes: string[];
};
type Sticker = {
  code: string;
  sectionName: string;
};
type Collection = Record<string, number>;
type OpenSections = Record<string, boolean>;
type ImportedDuplicate = {
  code: string;
  label: string;
};
type ImportedList = {
  missing: string[];
  duplicates: ImportedDuplicate[];
};

const albumSections = albumSectionsData as AlbumSection[];
const albumStickers: Sticker[] = albumSections.flatMap((section) =>
  section.codes.map((code) => ({
    code,
    sectionName: section.name,
  })),
);
const stickerCodeSet = new Set(albumStickers.map((sticker) => sticker.code));
const maxVisibleCodes = 80;
const collectionStorageKey = "stickerswapbook.collection.v1";
const privacyPolicyUrl = "https://naumz13.github.io/swapbook-sticker-collectors/privacy-policy.html";

const sampleImport = [
  "StickerSwapbook - Football Sticker Album 2026",
  "",
  "Missing: ARG5, MEX2, FRA9, FWC10, SCO2",
  "Duplicates: ARG3 x2, BRA7 x3, USA11 x2, FWC11 x2",
].join("\n");

export default function Index() {
  const [collection, setCollection] = useState<Collection>({});
  const [importText, setImportText] = useState("");
  const [importedList, setImportedList] = useState<ImportedList | null>(null);
  const [openSections, setOpenSections] = useState<OpenSections>({});
  const [hasLoadedCollection, setHasLoadedCollection] = useState(false);

  useEffect(() => {
    const loadCollection = async () => {
      try {
        const savedCollection = await AsyncStorage.getItem(collectionStorageKey);

        if (savedCollection) {
          setCollection(sanitizeCollection(JSON.parse(savedCollection)));
        }
      } catch {
        Alert.alert("Collection not loaded", "Your saved stickers could not be loaded on this device.");
      } finally {
        setHasLoadedCollection(true);
      }
    };

    loadCollection();
  }, []);

  useEffect(() => {
    if (!hasLoadedCollection) {
      return;
    }

    const saveCollection = async () => {
      try {
        await AsyncStorage.setItem(collectionStorageKey, JSON.stringify(collection));
      } catch {
        Alert.alert("Collection not saved", "Your latest sticker changes could not be saved on this device.");
      }
    };

    saveCollection();
  }, [collection, hasLoadedCollection]);

  const ownedStickers = useMemo(
    () => albumStickers.filter((sticker) => getQuantity(collection, sticker.code) > 0),
    [collection],
  );

  const missingCodes = useMemo(
    () =>
      albumStickers
        .filter((sticker) => getQuantity(collection, sticker.code) === 0)
        .map((sticker) => sticker.code),
    [collection],
  );

  const duplicateCodes = useMemo(
    () =>
      albumStickers
        .filter((sticker) => getQuantity(collection, sticker.code) > 1)
        .map((sticker) => formatDuplicateLabel(sticker.code, getQuantity(collection, sticker.code))),
    [collection],
  );

  const duplicateCopyCount = useMemo(
    () =>
      albumStickers.reduce((total, sticker) => {
        const quantity = getQuantity(collection, sticker.code);

        return total + Math.max(quantity - 1, 0);
      }, 0),
    [collection],
  );

  const completion = (ownedStickers.length / albumStickers.length) * 100;
  const completionLabel = formatCompletionPercent(completion);

  const comparison = useMemo(() => {
    if (!importedList) {
      return null;
    }

    const iCanGiveThem = importedList.missing
      .filter((code) => getQuantity(collection, code) > 1)
      .map((code) => formatDuplicateLabel(code, getQuantity(collection, code)));

    const theyCanGiveMe = importedList.duplicates
      .filter((duplicate) => getQuantity(collection, duplicate.code) === 0)
      .map((duplicate) => duplicate.label);

    return {
      iCanGiveThem,
      theyCanGiveMe,
    };
  }, [collection, importedList]);

  const changeStickerQuantity = (code: string, amount: number) => {
    setCollection((currentCollection) => {
      const nextQuantity = Math.max(0, Math.min(9, getQuantity(currentCollection, code) + amount));
      const nextCollection = { ...currentCollection };

      if (nextQuantity === 0) {
        delete nextCollection[code];
      } else {
        nextCollection[code] = nextQuantity;
      }

      return nextCollection;
    });
  };

  const toggleSection = (sectionName: string) => {
    setOpenSections((currentSections) => ({
      ...currentSections,
      [sectionName]: !currentSections[sectionName],
    }));
  };

  const shareSwapList = async () => {
    await Share.share({
      title: "StickerSwapbook swap list",
      message: buildShareMessage(missingCodes, duplicateCodes),
    });
  };

  const compareImportedList = () => {
    const parsedList = parseImportedList(importText);

    if (parsedList.missing.length === 0 && parsedList.duplicates.length === 0) {
      Alert.alert(
        "No stickers found",
        "Paste a list with Missing: and Duplicates: lines, then try again.",
      );
      return;
    }

    setImportedList(parsedList);
  };

  const loadSampleImport = () => {
    setImportText(sampleImport);
    setImportedList(parseImportedList(sampleImport));
  };

  const clearImportText = () => {
    setImportText("");
    setImportedList(null);
  };

  const clearCollection = async () => {
    try {
      await AsyncStorage.removeItem(collectionStorageKey);
    } catch {
      Alert.alert("Reset warning", "Saved stickers could not be cleared from device storage.");
    } finally {
      setCollection({});
      setImportText("");
      setImportedList(null);
      setOpenSections({});
    }
  };

  const resetCollection = () => {
    Alert.alert("Reset collection?", "This clears your Football Sticker Album 2026 collection.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: clearCollection,
      },
    ]);
  };

  const openPrivacyPolicy = async () => {
    await Linking.openURL(privacyPolicyUrl);
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar style="dark" />

      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <View style={styles.heroTitleGroup}>
              <Text style={styles.eyebrow}>Football Sticker Album 2026</Text>
              <Text style={styles.title}>StickerSwapbook</Text>
            </View>

            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeValue}>{completionLabel}</Text>
              <Text style={styles.heroBadgeLabel}>filled</Text>
            </View>
          </View>

          <Text style={styles.subtitle}>Full checklist ordered by album section.</Text>

          <View style={styles.progressBlock}>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    minWidth: completion > 0 ? 4 : 0,
                    width: `${completion}%`,
                  },
                ]}
              />
            </View>
            <Text style={styles.progressCopy}>
              {ownedStickers.length} of {albumStickers.length} stickers filled
            </Text>
          </View>
        </View>

        <View style={styles.statsRow}>
          <StatCard label="Filled" value={ownedStickers.length} icon="checkmark-circle-outline" tint="#047857" />
          <StatCard label="Missing" value={missingCodes.length} icon="search-outline" tint="#BE123C" />
          <StatCard label="Spare" value={duplicateCopyCount} icon="copy-outline" tint="#B45309" />
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            accessibilityRole="button"
            onPress={shareSwapList}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}
          >
            <Ionicons name="share-social-outline" size={20} color="#FFFFFF" />
            <Text style={styles.primaryButtonText}>Share</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={resetCollection}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Ionicons name="refresh-outline" size={20} color="#12312D" />
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </Pressable>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Album sections</Text>
          <Text style={styles.sectionCount}>{albumSections.length} sections</Text>
        </View>

        <View style={styles.sectionsStack}>
          {albumSections.map((section) => {
            const isOpen = Boolean(openSections[section.name]);
            const ownedCount = getSectionOwnedCount(section.codes, collection);

            return (
              <View key={section.name} style={styles.sectionBlock}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => toggleSection(section.name)}
                  style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.pressed]}
                >
                  <View style={styles.sectionTitleGroup}>
                    <Text style={styles.sectionTitle}>{section.name}</Text>
                    <Text style={styles.sectionCount}>{getSectionCodeSummary(section.codes)}</Text>
                  </View>

                  <View style={styles.collapsibleHeaderRight}>
                    <Text style={styles.collapsibleSummary}>
                      {ownedCount}/{section.codes.length}
                    </Text>
                    <Ionicons
                      name={isOpen ? "chevron-up" : "chevron-down"}
                      size={22}
                      color="#12312D"
                    />
                  </View>
                </Pressable>

                {isOpen && (
                  <View style={styles.stickerGrid}>
                    {section.codes.map((code) => {
                      const quantity = getQuantity(collection, code);
                      const state = getStickerState(quantity);

                      return (
                        <View key={code} style={[styles.stickerTile, styles[`${state}Tile`]]}>
                          <View style={styles.stickerTop}>
                            <Text style={styles.stickerCode}>{code}</Text>
                            <StickerStateIcon quantity={quantity} />
                          </View>

                          <Text style={[styles.stickerState, styles[`${state}Text`]]}>
                            {getStickerStatusLabel(quantity)}
                          </Text>

                          <View style={styles.quantityControls}>
                            <Pressable
                              accessibilityRole="button"
                              disabled={quantity === 0}
                              onPress={() => changeStickerQuantity(code, -1)}
                              style={({ pressed }) => [
                                styles.quantityButton,
                                quantity === 0 && styles.quantityButtonDisabled,
                                pressed && quantity > 0 && styles.pressed,
                              ]}
                            >
                              <Ionicons name="remove" size={18} color={quantity === 0 ? "#A8B2AF" : "#12312D"} />
                            </Pressable>

                            <Text style={styles.quantityValue}>{quantity}</Text>

                            <Pressable
                              accessibilityRole="button"
                              onPress={() => changeStickerQuantity(code, 1)}
                              style={({ pressed }) => [
                                styles.quantityButton,
                                styles.quantityButtonAdd,
                                pressed && styles.pressed,
                              ]}
                            >
                              <Ionicons name="add" size={18} color="#FFFFFF" />
                            </Pressable>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.listPanel}>
          <StickerList title="Missing" icon="search-outline" codes={missingCodes} tone="missing" />
          <View style={styles.listDivider} />
          <StickerList title="Duplicates" icon="copy-outline" codes={duplicateCodes} tone="duplicate" />
        </View>

        <View style={styles.importPanel}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Import swap list</Text>
            <View style={styles.importActions}>
              <Pressable accessibilityRole="button" onPress={loadSampleImport}>
                <Text style={styles.linkText}>Use sample</Text>
              </Pressable>
              {(importText.length > 0 || importedList) && (
                <Pressable accessibilityRole="button" onPress={clearImportText}>
                  <Text style={styles.clearLinkText}>Clear</Text>
                </Pressable>
              )}
            </View>
          </View>

          <TextInput
            multiline
            onChangeText={(value) => {
              setImportText(value);
              setImportedList(null);
            }}
            placeholder={"Missing: ARG5, MEX2, FWC10\nDuplicates: ARG3 x2, BRA7 x3"}
            placeholderTextColor="#8A9894"
            style={styles.importInput}
            textAlignVertical="top"
            value={importText}
          />

          <Pressable
            accessibilityRole="button"
            onPress={compareImportedList}
            style={({ pressed }) => [styles.compareButton, pressed && styles.pressed]}
          >
            <Ionicons name="git-compare-outline" size={20} color="#FFFFFF" />
            <Text style={styles.compareButtonText}>Compare</Text>
          </Pressable>

          {comparison && (
            <View style={styles.matchPanel}>
              <MatchList title="You can give them" codes={comparison.iCanGiveThem} tone="duplicate" />
              <View style={styles.listDivider} />
              <MatchList title="They can give you" codes={comparison.theyCanGiveMe} tone="missing" />
            </View>
          )}
        </View>

        <Pressable
          accessibilityRole="link"
          onPress={openPrivacyPolicy}
          style={({ pressed }) => [styles.footerLink, pressed && styles.pressed]}
        >
          <Text style={styles.footerLinkText}>Privacy Policy</Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

function StatCard({
  label,
  value,
  icon,
  tint,
}: {
  label: string;
  value: number;
  icon: IconName;
  tint: string;
}) {
  return (
    <View style={styles.statCard}>
      <Ionicons name={icon} size={20} color={tint} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StickerList({
  title,
  icon,
  codes,
  tone,
}: {
  title: string;
  icon: IconName;
  codes: string[];
  tone: "missing" | "duplicate";
}) {
  const visibleCodes = codes.slice(0, maxVisibleCodes);
  const hiddenCount = codes.length - visibleCodes.length;

  return (
    <View style={styles.listColumn}>
      <View style={styles.listHeader}>
        <Ionicons name={icon} size={18} color={tone === "missing" ? "#BE123C" : "#B45309"} />
        <Text style={styles.listTitle}>{title}</Text>
        <Text style={styles.listCount}>{codes.length}</Text>
      </View>

      <View style={styles.pillWrap}>
        {codes.length > 0 ? (
          <>
            {visibleCodes.map((code) => <StickerPill key={code} label={code} tone={tone} />)}
            {hiddenCount > 0 && <MorePill count={hiddenCount} />}
          </>
        ) : (
          <Text style={styles.emptyText}>None</Text>
        )}
      </View>
    </View>
  );
}

function MatchList({
  title,
  codes,
  tone,
}: {
  title: string;
  codes: string[];
  tone: "missing" | "duplicate";
}) {
  return (
    <View style={styles.listColumn}>
      <Text style={styles.matchTitle}>{title}</Text>
      <View style={styles.pillWrap}>
        {codes.length > 0 ? (
          codes.map((code) => <StickerPill key={code} label={code} tone={tone} />)
        ) : (
          <Text style={styles.emptyText}>No matches yet</Text>
        )}
      </View>
    </View>
  );
}

function StickerPill({ label, tone }: { label: string; tone: "missing" | "duplicate" }) {
  return (
    <View style={[styles.pill, tone === "missing" ? styles.missingPill : styles.duplicatePill]}>
      <Text style={[styles.pillText, tone === "missing" ? styles.missingPillText : styles.duplicatePillText]}>
        {label}
      </Text>
    </View>
  );
}

function MorePill({ count }: { count: number }) {
  return (
    <View style={[styles.pill, styles.morePill]}>
      <Text style={[styles.pillText, styles.morePillText]}>+{count} more</Text>
    </View>
  );
}

function StickerStateIcon({ quantity }: { quantity: number }) {
  if (quantity === 0) {
    return <Ionicons name="ellipse-outline" size={20} color="#A8B2AF" />;
  }

  if (quantity === 1) {
    return <Ionicons name="checkmark-circle" size={21} color="#047857" />;
  }

  return <Ionicons name="copy-outline" size={20} color="#B45309" />;
}

function getQuantity(collection: Collection, code: string) {
  return collection[code] ?? 0;
}

function sanitizeCollection(value: unknown): Collection {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.entries(value).reduce<Collection>((collection, [code, quantity]) => {
    if (!stickerCodeSet.has(code) || typeof quantity !== "number") {
      return collection;
    }

    const safeQuantity = Math.max(0, Math.min(9, Math.floor(quantity)));

    if (safeQuantity > 0) {
      collection[code] = safeQuantity;
    }

    return collection;
  }, {});
}

function getStickerState(quantity: number): StickerState {
  if (quantity === 0) {
    return "missing";
  }

  if (quantity === 1) {
    return "owned";
  }

  return "duplicate";
}

function getStickerStatusLabel(quantity: number) {
  if (quantity === 0) {
    return "Missing";
  }

  if (quantity === 1) {
    return "Owned";
  }

  return `${quantity} copies`;
}

function formatCompletionPercent(completion: number) {
  if (completion === 0) {
    return "0%";
  }

  return `${completion.toFixed(1)}%`;
}

function getSectionOwnedCount(codes: string[], collection: Collection) {
  return codes.filter((code) => getQuantity(collection, code) > 0).length;
}

function getSectionCodeSummary(codes: string[]) {
  if (codes.length === 0) {
    return "0 stickers";
  }

  if (codes[0] === "00" && codes[1]) {
    return `00, ${codes[1]}-${codes[codes.length - 1]}`;
  }

  if (codes.length === 1) {
    return codes[0];
  }

  return `${codes[0]}-${codes[codes.length - 1]}`;
}

function formatDuplicateLabel(code: string, quantity: number) {
  return `${code} x${quantity}`;
}

function buildShareMessage(missingCodes: string[], duplicateCodes: string[]) {
  return [
    "StickerSwapbook - Football Sticker Album 2026",
    "",
    `Missing: ${formatListForShare(missingCodes)}`,
    `Duplicates: ${formatListForShare(duplicateCodes)}`,
  ].join("\n");
}

function formatListForShare(codes: string[]) {
  return codes.length > 0 ? codes.join(", ") : "None";
}

function parseImportedList(text: string): ImportedList {
  const missingLine = text.match(/Missing:\s*([^\n\r]+)/i)?.[1] ?? "";
  const duplicateLine = text.match(/Duplicates:\s*([^\n\r]+)/i)?.[1] ?? "";

  return {
    missing: parseCodeList(missingLine),
    duplicates: parseDuplicateList(duplicateLine),
  };
}

function parseCodeList(value: string) {
  return unique(
    value
      .split(",")
      .map((entry) => normalizeStickerCode(entry))
      .filter((code): code is string => Boolean(code)),
  );
}

function parseDuplicateList(value: string): ImportedDuplicate[] {
  const duplicates = value
    .split(",")
    .map((entry) => {
      const code = normalizeStickerCode(entry);

      if (!code) {
        return null;
      }

      const quantity = Number(entry.match(/x\s*(\d+)/i)?.[1]);

      return {
        code,
        label: Number.isFinite(quantity) && quantity > 1 ? formatDuplicateLabel(code, quantity) : code,
      };
    })
    .filter((duplicate): duplicate is ImportedDuplicate => Boolean(duplicate));

  const seenCodes = new Set<string>();

  return duplicates.filter((duplicate) => {
    if (seenCodes.has(duplicate.code)) {
      return false;
    }

    seenCodes.add(duplicate.code);
    return true;
  });
}

function normalizeStickerCode(value: string) {
  const compactValue = value.toUpperCase().replace(/\s+/g, "");
  const withoutQuantity = compactValue.replace(/X\d+$/, "");

  if (stickerCodeSet.has(withoutQuantity)) {
    return withoutQuantity;
  }

  if (/^0+$/.test(withoutQuantity) && stickerCodeSet.has("00")) {
    return "00";
  }

  const match = withoutQuantity.match(/^([A-Z]{2,3})0*(\d{1,2})$/);

  if (!match) {
    return null;
  }

  const code = `${match[1]}${Number(match[2])}`;

  return stickerCodeSet.has(code) ? code : null;
}

function unique(codes: string[]) {
  return Array.from(new Set(codes));
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F4F7F9",
  },
  content: {
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 58,
    paddingBottom: 34,
    gap: 18,
  },
  hero: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "#E2E8E6",
    shadowColor: "#12312D",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    elevation: 6,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  heroTitleGroup: {
    flex: 1,
  },
  eyebrow: {
    color: "#047857",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0,
  },
  title: {
    color: "#12312D",
    fontSize: 31,
    lineHeight: 36,
    fontWeight: "900",
    marginTop: 4,
  },
  heroBadge: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F5EF",
  },
  heroBadgeValue: {
    color: "#047857",
    fontSize: 19,
    fontWeight: "900",
  },
  heroBadgeLabel: {
    color: "#42635C",
    fontSize: 11,
    fontWeight: "800",
  },
  subtitle: {
    color: "#5F6F6B",
    fontSize: 16,
    lineHeight: 22,
    marginTop: 10,
  },
  progressBlock: {
    marginTop: 24,
  },
  progressTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: "#E3E9E7",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    backgroundColor: "#16A34A",
  },
  progressCopy: {
    color: "#5F6F6B",
    fontSize: 14,
    marginTop: 9,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    minHeight: 98,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8E6",
    justifyContent: "space-between",
  },
  statValue: {
    color: "#12312D",
    fontSize: 24,
    fontWeight: "900",
  },
  statLabel: {
    color: "#6B7673",
    fontSize: 12,
    fontWeight: "700",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#047857",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D6E0DD",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  secondaryButtonText: {
    color: "#12312D",
    fontSize: 16,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.74,
    transform: [{ scale: 0.99 }],
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: "#12312D",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionTitleGroup: {
    flex: 1,
    gap: 3,
  },
  sectionCount: {
    color: "#6B7673",
    fontSize: 13,
    fontWeight: "700",
  },
  sectionsStack: {
    gap: 12,
  },
  sectionBlock: {
    gap: 12,
  },
  collapsibleHeader: {
    minHeight: 72,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8E6",
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  collapsibleHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  collapsibleSummary: {
    color: "#047857",
    fontSize: 15,
    fontWeight: "900",
  },
  stickerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  stickerTile: {
    width: "48%",
    minHeight: 136,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    justifyContent: "space-between",
  },
  missingTile: {
    borderColor: "#E2E8E6",
  },
  ownedTile: {
    borderColor: "#BFE7D4",
    backgroundColor: "#FBFFFD",
  },
  duplicateTile: {
    borderColor: "#FED7AA",
    backgroundColor: "#FFFDF9",
  },
  stickerTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stickerCode: {
    color: "#12312D",
    fontSize: 17,
    fontWeight: "900",
  },
  stickerState: {
    fontSize: 13,
    fontWeight: "900",
  },
  missingText: {
    color: "#7A8783",
  },
  ownedText: {
    color: "#047857",
  },
  duplicateText: {
    color: "#B45309",
  },
  quantityControls: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  quantityButton: {
    width: 38,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EEF3F1",
  },
  quantityButtonAdd: {
    backgroundColor: "#12312D",
  },
  quantityButtonDisabled: {
    backgroundColor: "#F1F5F4",
  },
  quantityValue: {
    minWidth: 28,
    textAlign: "center",
    color: "#12312D",
    fontSize: 18,
    fontWeight: "900",
  },
  listPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8E6",
    padding: 16,
    gap: 16,
  },
  listColumn: {
    gap: 12,
  },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  listTitle: {
    color: "#12312D",
    fontSize: 16,
    fontWeight: "900",
  },
  listCount: {
    minWidth: 26,
    minHeight: 24,
    borderRadius: 12,
    overflow: "hidden",
    textAlign: "center",
    color: "#56645F",
    backgroundColor: "#EEF3F1",
    fontSize: 13,
    fontWeight: "900",
    paddingTop: 3,
  },
  listDivider: {
    height: 1,
    backgroundColor: "#E2E8E6",
  },
  pillWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  missingPill: {
    backgroundColor: "#FFF1F2",
  },
  duplicatePill: {
    backgroundColor: "#FFF7ED",
  },
  morePill: {
    backgroundColor: "#EEF3F1",
  },
  pillText: {
    fontSize: 13,
    fontWeight: "900",
  },
  missingPillText: {
    color: "#BE123C",
  },
  duplicatePillText: {
    color: "#B45309",
  },
  morePillText: {
    color: "#56645F",
  },
  emptyText: {
    color: "#7A8783",
    fontSize: 14,
    fontWeight: "700",
  },
  importPanel: {
    backgroundColor: "#FFFFFF",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "#E2E8E6",
    padding: 16,
    gap: 14,
  },
  linkText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "800",
  },
  importActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  clearLinkText: {
    color: "#BE123C",
    fontSize: 14,
    fontWeight: "800",
  },
  importInput: {
    minHeight: 118,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D6E0DD",
    backgroundColor: "#F8FAFA",
    color: "#12312D",
    fontSize: 15,
    lineHeight: 21,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  compareButton: {
    minHeight: 52,
    borderRadius: 17,
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  compareButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  matchPanel: {
    borderRadius: 18,
    backgroundColor: "#F8FAFA",
    borderWidth: 1,
    borderColor: "#E2E8E6",
    padding: 14,
    gap: 14,
  },
  matchTitle: {
    color: "#12312D",
    fontSize: 15,
    fontWeight: "900",
  },
  footerLink: {
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  footerLinkText: {
    color: "#2563EB",
    fontSize: 14,
    fontWeight: "800",
  },
});
