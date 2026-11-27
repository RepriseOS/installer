import type React from "react";
import { useHeadingFocus } from "../hooks/useHeadingFocus";
import { ChoiceButton } from "./ui/ChoiceButton";
import { InstallerScreen } from "./ui/InstallerScreen";

interface IMainScreenProps {
  onInstall: () => void;
  onManageExtensions: () => void;
  onAbout: () => void;
  installDisabled?: boolean;
  updates: React.ReactNode;
}

const MainScreen: React.FC<IMainScreenProps> = ({
  onInstall,
  onManageExtensions,
  onAbout,
  installDisabled,
  updates,
}) => {
  const { headingRef } = useHeadingFocus();

  return (
    <InstallerScreen.Root aria-labelledby="main-title">
      <InstallerScreen.Title id="main-title" ref={headingRef} tabIndex={-1}>
        RepriseOS
      </InstallerScreen.Title>
      <InstallerScreen.Actions className="mx-auto mt-9 max-w-100 flex-col gap-3">
        <ChoiceButton
          title="Install/Update RepriseOS"
          description="Install or update RepriseOS on your iPod."
          onClick={onInstall}
          disabled={installDisabled}
        />
        <ChoiceButton
          title="Manage extensions"
          description="Add, update or remove extensions on a connected iPod."
          onClick={onManageExtensions}
          disabled={installDisabled}
        />
      </InstallerScreen.Actions>
      <button
        type="button"
        onClick={onAbout}
        className="mx-auto mt-3 block cursor-pointer rounded-sm text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-focus"
      >
        About
      </button>
      {updates}
    </InstallerScreen.Root>
  );
};

export { MainScreen };
