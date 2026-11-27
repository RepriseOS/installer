import React from "react";
import { useHeadingFocus } from "../hooks/useHeadingFocus";
import { type AboutInfo, fetchAbout } from "../lib/about";
import { errorDetail } from "../lib/errors";
import { Button } from "./ui/Button";
import { InstallerScreen } from "./ui/InstallerScreen";

function LicenseText({ title, text }: { title: string; text: string }) {
  return (
    <details>
      <summary className="cursor-pointer rounded-sm px-2 py-1 text-[13px] text-body outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/50">
        {title}
      </summary>
      <pre
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Allow keyboard scrolling in the licence text.
        tabIndex={0}
        className="installer-well mt-2 max-h-96 overflow-auto rounded-lg p-5 font-mono text-[12px] leading-[1.7] whitespace-pre-wrap text-body outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
      >
        {text}
      </pre>
    </details>
  );
}

interface IAboutScreenProps {
  onBack: () => void;
}

const AboutScreen: React.FC<IAboutScreenProps> = ({ onBack }) => {
  const { headingRef } = useHeadingFocus();
  const [info, setInfo] = React.useState<AboutInfo | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetchAbout()
      .then((value) => {
        if (!cancelled) setInfo(value);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(errorDetail(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <InstallerScreen.Root aria-labelledby="about-title">
      <InstallerScreen.Title id="about-title" ref={headingRef} tabIndex={-1}>
        RepriseOS Installer
      </InstallerScreen.Title>
      <InstallerScreen.Description>
        {info ? `Version ${info.version}` : (error ?? "Loading…")}
      </InstallerScreen.Description>
      {info && (
        <div className="mx-auto mt-7 max-w-135 space-y-3 text-left">
          <LicenseText title="GNU General Public License v3.0" text={info.license} />
          <LicenseText title="Third-party licences" text={info.third_party} />
        </div>
      )}
      <InstallerScreen.Actions>
        <Button.Root onClick={onBack}>
          <Button.Label>Back</Button.Label>
        </Button.Root>
      </InstallerScreen.Actions>
    </InstallerScreen.Root>
  );
};

export { AboutScreen };
