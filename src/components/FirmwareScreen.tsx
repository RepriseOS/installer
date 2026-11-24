import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import React from "react";
import { useHeadingFocus } from "../hooks/useHeadingFocus";
import { errorDetail } from "../lib/errors";
import { cachedFirmware, chooseFirmware, type FirmwareInfo } from "../lib/firmware";
import { chooseLocalPackage, type PackageInfo, preparePackage } from "../lib/package";
import { appendSessionLog } from "../lib/sessionLog";
import { LocalPackagePicker } from "./LocalPackagePicker";
import { Button } from "./ui/Button";
import { CheckStatusIndicator } from "./ui/CheckList";
import { InformationSymbol } from "./ui/InformationSymbol";
import { InstallerScreen } from "./ui/InstallerScreen";
import { ScreenReveal } from "./ui/ScreenReveal";

interface IFirmwareScreenProps {
  file: FirmwareInfo | null;
  onSelect: (file: FirmwareInfo | null) => void;
  localPackage: PackageInfo | null;
  onSelectPackage: (value: PackageInfo | null) => void;
  onContinue: (packageDigest: string) => void;
  onBack: () => void;
}

const FirmwareScreen: React.FC<IFirmwareScreenProps> = ({
  file,
  onSelect,
  localPackage,
  onSelectPackage,
  onContinue,
  onBack,
}) => {
  const [filename, setFilename] = React.useState(file?.filename ?? "");
  const { headingRef } = useHeadingFocus();
  const [error, setError] = React.useState("");
  const [packageError, setPackageError] = React.useState("");
  const [loading, setLoading] = React.useState<"choose" | "prepare" | null>(null);
  const [usingSavedFirmware, setUsingSavedFirmware] = React.useState(!!file);
  const [firmwareAction, setFirmwareAction] = React.useState<
    "cache" | "choose" | "validate" | null
  >(file ? null : "cache");
  const choosingFirmware = firmwareAction !== null;
  const validatingFirmware = firmwareAction === "validate" || firmwareAction === "cache";
  const reducedMotion = useReducedMotion();

  const initialFile = React.useRef(file);
  const selectFirmware = React.useEffectEvent(onSelect);
  React.useEffect(() => {
    if (initialFile.current) return;
    let active = true;
    void cachedFirmware()
      .then((cached) => {
        if (!active || !cached) return;
        setFilename(cached.filename);
        setUsingSavedFirmware(true);
        selectFirmware(cached);
        appendSessionLog(
          `Using verified cached Apple firmware: ${cached.filename} (${cached.sha256}).`,
        );
      })
      .catch((error: unknown) => {
        if (active) {
          setError(errorDetail(error));
          appendSessionLog(`Cached firmware unavailable: ${errorDetail(error)}`);
        }
      })
      .finally(() => {
        if (active) setFirmwareAction(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const choosePackage = async () => {
    setLoading("choose");
    setPackageError("");
    try {
      const selected = await chooseLocalPackage();
      if (selected) {
        onSelectPackage(selected);
        appendSessionLog(`Local package loaded: ${selected.filename} (${selected.version}).`);
      }
    } catch (error) {
      const detail = errorDetail(error);
      setPackageError(detail);
      appendSessionLog(`Package loading failed: ${detail}`);
    } finally {
      setLoading(null);
    }
  };

  const continueSetup = async () => {
    if (!file || choosingFirmware || error || loading) return;
    setLoading("prepare");
    setPackageError("");
    try {
      const selected = await preparePackage(file.sha256, localPackage);
      appendSessionLog(`Package ready: ${selected.version} (${selected.digest}).`);
      onContinue(selected.digest);
    } catch (error) {
      const detail = errorDetail(error);
      setPackageError(detail);
      appendSessionLog(`Package preparation failed: ${detail}`);
    } finally {
      setLoading(null);
    }
  };

  return (
    <InstallerScreen.Root aria-labelledby="firmware-title">
      <ScreenReveal>
        <div className="mx-auto mb-8 size-20">
          <InformationSymbol />
        </div>
        <InstallerScreen.Title id="firmware-title" ref={headingRef} tabIndex={-1}>
          Choose your firmware file.
        </InstallerScreen.Title>
      </ScreenReveal>
      <ScreenReveal delay={0.08}>
        <InstallerScreen.Description>
          Select iPod_38.2.0.5.ipsw for any supported iPod Classic.
        </InstallerScreen.Description>
        <div className="installer-well mx-auto mt-7 flex max-w-125 flex-wrap items-center justify-between gap-4 rounded-lg p-4 text-left">
          <div className="min-w-0 flex-1 text-[13px] text-body" role="status">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={filename || "empty"}
                className="break-all"
                initial={{ opacity: 0, y: reducedMotion ? 0 : 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.18 }}
              >
                {filename || "No firmware selected"}
              </motion.p>
            </AnimatePresence>
          </div>
          <Button.Root
            size="compact"
            disabled={!!loading || choosingFirmware}
            onClick={async () => {
              setFirmwareAction("choose");
              try {
                const selected = await chooseFirmware((name) => {
                  setFilename(name);
                  setUsingSavedFirmware(false);
                  onSelect(null);
                  setError("");
                  setFirmwareAction("validate");
                  appendSessionLog(`Validating firmware: ${name}.`);
                });
                if (selected) {
                  setFilename(selected.filename);
                  setUsingSavedFirmware(false);
                  setError("");
                  onSelect(selected);
                }
              } catch (error) {
                const detail = errorDetail(error);
                onSelect(null);
                setError(detail);
                appendSessionLog(`Firmware validation failed: ${detail}`);
              } finally {
                setFirmwareAction(null);
              }
            }}
          >
            <Button.Label>{filename ? "Change…" : "Choose file…"}</Button.Label>
          </Button.Root>
        </div>
        <div className="mx-auto max-w-125 text-left" role="status" aria-atomic="true">
          {(validatingFirmware || error || file) && (
            <p className="mt-3 flex items-center gap-2 text-[12px] text-body">
              <CheckStatusIndicator
                status={validatingFirmware ? "checking" : error ? "failed" : "passed"}
              />
              {firmwareAction === "cache"
                ? "Checking saved Apple 2.0.5 firmware…"
                : validatingFirmware
                  ? "Checking firmware compatibility…"
                  : error
                    ? "Firmware validation failed."
                    : usingSavedFirmware
                      ? `Using verified saved Apple ${file?.version} firmware`
                      : `Compatible Apple ${file?.version} firmware`}
            </p>
          )}
          <AnimatePresence initial={false}>
            {error && (
              <motion.p
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: reducedMotion ? 0 : 0.2 }}
                className="overflow-hidden text-[12px] leading-6 text-error"
              >
                {error}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        <LocalPackagePicker
          localPackage={localPackage}
          loading={loading}
          disabled={!!loading || choosingFirmware}
          packageError={packageError}
          onChoose={choosePackage}
          onAutomatic={() => {
            onSelectPackage(null);
            setPackageError("");
            appendSessionLog("Automatic package download selected.");
          }}
        />
      </ScreenReveal>
      <ScreenReveal delay={0.16}>
        <InstallerScreen.Actions>
          <Button.Root disabled={!!loading || choosingFirmware} onClick={onBack}>
            <Button.Label>Back</Button.Label>
          </Button.Root>
          <Button.Root
            disabled={!file || !!error || !!loading || choosingFirmware}
            onClick={continueSetup}
          >
            <Button.Label>
              {loading === "prepare" ? (localPackage ? "Preparing…" : "Downloading…") : "Continue"}
            </Button.Label>
          </Button.Root>
        </InstallerScreen.Actions>
      </ScreenReveal>
    </InstallerScreen.Root>
  );
};

export { FirmwareScreen };
