import { type KeyboardEvent, useRef, useState } from "react";
import type { CatalogScreenshot } from "../../lib/catalog";
import { cn } from "../../lib/cn";

const arrowClass =
  "glass-button glass-button-neutral inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-[#c2bfba] text-ink transition-opacity disabled:pointer-events-none disabled:opacity-0";

const Chevron = ({ back }: { back?: boolean }) => (
  <svg className="size-4" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d={back ? "M10 3.5 5.5 8l4.5 4.5" : "M6 3.5 10.5 8 6 12.5"}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export function ScreenshotCarousel({ screenshots }: { screenshots: CatalogScreenshot[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const count = screenshots.length;
  if (!count) return null;
  const multiple = count > 1;

  const go = (target: number) => {
    const element = track.current;
    if (!element) return;
    const next = Math.max(0, Math.min(count - 1, target));
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollTo({ left: next * element.clientWidth, behavior: reduce ? "auto" : "smooth" });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const targets: Record<string, number> = {
      ArrowLeft: index - 1,
      ArrowRight: index + 1,
      Home: 0,
      End: count - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    go(targets[event.key]);
  };

  return (
    <section
      className="mt-6 rounded-2xl border border-[#d5d2cc] bg-white/45 px-5 py-6"
      aria-roledescription="carousel"
      aria-label="Screenshots"
    >
      <div className="flex items-center justify-center gap-4">
        {multiple && (
          <button
            type="button"
            className={arrowClass}
            aria-label="Previous screenshot"
            disabled={index === 0}
            onClick={() => go(index - 1)}
          >
            <Chevron back />
          </button>
        )}

        <div className="relative w-full min-w-0 max-w-84 rounded-[14px] bg-[linear-gradient(180deg,#3a3a3d_0%,#1b1b1d_100%)] p-2 shadow-[inset_0_1px_0_#ffffff26,0_1px_0_#fff,0_10px_24px_#29241c40]">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: focusable scroller takes arrow keys */}
          <div
            ref={track}
            tabIndex={multiple ? 0 : undefined}
            onKeyDown={multiple ? onKeyDown : undefined}
            onScroll={(event) => {
              const element = event.currentTarget;
              setIndex(Math.round(element.scrollLeft / element.clientWidth));
            }}
            className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-none rounded-[4px] bg-black [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus [&::-webkit-scrollbar]:hidden"
          >
            {screenshots.map((shot, i) => (
              <div key={shot.url} className="w-full shrink-0 snap-center snap-always">
                <img
                  className="block aspect-4/3 h-auto w-full object-contain [image-rendering:pixelated]"
                  src={shot.url}
                  alt={shot.alt}
                  width={shot.width}
                  height={shot.height}
                  loading={i === 0 ? "eager" : "lazy"}
                  draggable={false}
                />
              </div>
            ))}
          </div>
          <span
            className="pointer-events-none absolute inset-2 rounded-[4px] bg-[linear-gradient(160deg,#ffffff14_0%,#ffffff00_42%)]"
            aria-hidden="true"
          />
        </div>

        {multiple && (
          <button
            type="button"
            className={arrowClass}
            aria-label="Next screenshot"
            disabled={index === count - 1}
            onClick={() => go(index + 1)}
          >
            <Chevron />
          </button>
        )}
      </div>

      {multiple && (
        <>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {screenshots.map((shot, i) => (
              <button
                key={shot.url}
                type="button"
                className={cn(
                  "overflow-hidden rounded-[5px] border-2 transition-[border-color,opacity]",
                  i === index ? "border-focus" : "border-transparent opacity-60 hover:opacity-100",
                )}
                aria-label={`Show screenshot ${i + 1}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => go(i)}
              >
                <img
                  className="block h-9 w-12 bg-black object-cover [image-rendering:pixelated]"
                  src={shot.url}
                  alt=""
                  width={48}
                  height={36}
                  loading="lazy"
                  draggable={false}
                />
              </button>
            ))}
          </div>
          <p className="sr-only" aria-live="polite" aria-atomic="true">
            Screenshot {index + 1} of {count}
          </p>
        </>
      )}
    </section>
  );
}
