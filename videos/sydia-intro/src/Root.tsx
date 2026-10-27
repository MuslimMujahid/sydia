import { Composition } from "remotion";
import { SydiaIntro } from "./SydiaIntro";
import {
  SydiaTiktokDeadline,
  TIKTOK_FRAMES,
} from "./tiktok/SydiaTiktokDeadline";
import {
  PENGINGAT_FRAMES,
  SydiaTiktokPengingat,
} from "./tiktok-pengingat/SydiaTiktokPengingat";
import { KTP_FRAMES, SydiaTiktokKtp } from "./tiktok-ktp/SydiaTiktokKtp";
import { KUE_FRAMES, SydiaTiktokKue } from "./tiktok-kue/SydiaTiktokKue";
import {
  SydiaTiktokUndangan,
  UNDANGAN_FRAMES,
} from "./tiktok-undangan/SydiaTiktokUndangan";
import {
  LANGGANAN_FRAMES,
  SydiaTiktokLangganan,
} from "./tiktok-langganan/SydiaTiktokLangganan";
import { SydiaUsecase, USECASE_FRAMES } from "./usecase/SydiaUsecase";

// Scene lengths in SydiaIntro.tsx, minus eight 14-frame transitions.
const DURATION =
  Math.round((9.6 + 7.6 + 7 + 7.4 + 7.6 + 7.2 + 5.8 + 9.4 + 8.4) * 30) - 8 * 14;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="SydiaIntro"
        component={SydiaIntro}
        durationInFrames={DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SydiaUsecasePresentasi"
        component={SydiaUsecase}
        durationInFrames={USECASE_FRAMES(30)}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="SydiaTiktokDeadline"
        component={SydiaTiktokDeadline}
        durationInFrames={TIKTOK_FRAMES(30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="SydiaTiktokPengingat"
        component={SydiaTiktokPengingat}
        durationInFrames={PENGINGAT_FRAMES(30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="SydiaTiktokLangganan"
        component={SydiaTiktokLangganan}
        durationInFrames={LANGGANAN_FRAMES(30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="SydiaTiktokKtp"
        component={SydiaTiktokKtp}
        durationInFrames={KTP_FRAMES(30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="SydiaTiktokKue"
        component={SydiaTiktokKue}
        durationInFrames={KUE_FRAMES(30)}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="SydiaTiktokUndangan"
        component={SydiaTiktokUndangan}
        durationInFrames={UNDANGAN_FRAMES(30)}
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
