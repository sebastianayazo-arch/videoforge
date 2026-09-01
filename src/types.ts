/**
 * VideoForge — Shared domain model.
 *
 * This file is the contract every module imports. It encodes the whole
 * pipeline: brand profile, intake, branching plan, captions, transitions,
 * audio design, compliance, retention and the learning loop.
 *
 * Design rule: types here describe *decisions*, not just data. A caption
 * carries its commercial function; a transition carries its reason; an SFX
 * carries its license. If it can be audited at a checkpoint, it lives here.
 */

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** ISO-8601 date, e.g. "2026-09-01". */
export type ISODate = string;

/** A hex colour, e.g. "#0A1F44". */
export type Hex = `#${string}`;

/** Frame index within a composition (fps-relative). */
export type Frame = number;

/** Seconds (floating point). */
export type Seconds = number;

/** Supported delivery markets. Copy adapts lexically per market. */
export type Market = "CO" | "MX" | "US-latino" | "other";

/** Ad / distribution platforms VideoForge targets. */
export type Platform = "tiktok" | "instagram" | "youtube" | "meta";

/** Aspect ratios. 9:16 is always the master; others are reframed. */
export type AspectRatio = "9:16" | "4:5" | "1:1";

/** Narrative branch (rama). */
export type Branch =
  | "problema-solucion"
  | "demo-directa"
  | "oferta-urgencia"
  | "ugc-testimonio"
  | "lanzamiento";

/** Copywriting framework applied to a branch. */
export type CopyFramework = "PAS" | "4U" | "resultado-primero" | "ugc-literal";

// ---------------------------------------------------------------------------
// Transcription (WhisperX)
// ---------------------------------------------------------------------------

export interface WordTiming {
  word: string;
  start: Seconds;
  end: Seconds;
  /** Diarised speaker label, e.g. "SPEAKER_00". */
  speaker?: string;
  /** ASR confidence 0..1. Low confidence flags manual review. */
  score?: number;
}

/**
 * How a stretch of audio functions in production. This classification drives
 * everything downstream: only `voz_modelo_a_camara` forces synced captions,
 * and `voz_direccion` must NEVER be audible in the output.
 */
export type AudioRole = "voz_modelo_a_camara" | "voz_direccion" | "ambiente";

export interface AudioSegment {
  start: Seconds;
  end: Seconds;
  role: AudioRole;
  speaker?: string;
  text?: string;
}

export interface Transcript {
  clipId: string;
  language: string;
  words: WordTiming[];
  segments: AudioSegment[];
}

// ---------------------------------------------------------------------------
// Vision (MediaPipe / OpenCV)
// ---------------------------------------------------------------------------

export interface BoundingBox {
  /** Normalised 0..1 against frame width/height. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FaceTrack {
  /** Bounding boxes keyed by frame; sparse (keyframes) is fine. */
  boxesByFrame: Record<number, BoundingBox>;
}

export interface OpticalFlowSample {
  frame: Frame;
  /** Dominant motion direction in degrees (0 = →, 90 = ↑). */
  directionDeg: number;
  /** Motion magnitude, normalised 0..1. */
  magnitude: number;
}

export interface ClipVisionAnalysis {
  clipId: string;
  fps: number;
  width: number;
  height: number;
  /** Explicit rotation from ffprobe side-data (0/90/180/270). */
  rotation: 0 | 90 | 180 | 270;
  faces: FaceTrack[];
  /** Product region if detected/annotated; captions must avoid it. */
  productRegionByFrame?: Record<number, BoundingBox>;
  flow: OpticalFlowSample[];
  /** Mean histogram per channel for colour matching (0..255). */
  histogram?: { r: number[]; g: number[]; b: number[] };
  whiteBalanceKelvin?: number;
}

// ---------------------------------------------------------------------------
// Brand profile — brands/<marca>/brand-profile.json
// ---------------------------------------------------------------------------

export interface BrandCaptionsProfile {
  h1Font: string;
  h2Font: string;
  baseFont: string;
  /** Script/display face reserved for slow H1/CTA only. */
  scriptFont?: string;
  accentColor: Hex;
  highlightColor: Hex;
  baseTextColor: Hex;
  outlineColor: Hex;
  /** Prefer plate vs outline for contrast. */
  contrastStrategy: "outline" | "plate" | "both";
  /** Verified the font renders tildes and ñ. */
  diacriticsVerified: boolean;
}

export interface VoiceSample {
  file: string;
  note?: string;
}

export interface BrandVoiceProfile {
  samples: VoiceSample[];
  /** Hard gate: no cloned narration without a recorded consent. */
  consent: boolean;
  consentDate?: ISODate;
  /** Engine used for cloning. XTTS-v2 / F5-TTS are forbidden for publish. */
  engine: "chatterbox" | "qwen3-tts" | "fish-speech";
}

export interface ModelRelease {
  modelId: string;
  displayName?: string;
  /** Face signature/embedding reference used to flag un-released faces. */
  faceRef?: string;
  authorizedForPaid: boolean;
  authorizedUntil?: ISODate;
}

export interface BrandImageRights {
  releases: ModelRelease[];
}

export interface BrandTransitionsProfile {
  /** Detected grammar weights 0..1 by transition type; biases the engine. */
  weights: Partial<Record<TransitionType, number>>;
  /** Types the brand avoids entirely. */
  banned?: TransitionType[];
  notes?: string;
}

export interface BrandColorProfile {
  temperature: "warm" | "neutral" | "cool";
  contrast: "low" | "medium" | "high";
  saturation: "muted" | "natural" | "punchy";
  /** Path to the generated brand LUT (.cube), seeded from brand posts. */
  lut?: string;
  /** Skin-tone hue range protected from grading (degrees on the hue wheel). */
  skinHueRange: [number, number];
}

export interface BrandCopyProfile {
  hookFormulas: string[];
  ctaFormulas: string[];
  /** Words the brand refuses (off-tone or non-compliant). */
  bannedWords: string[];
  toneNotes?: string;
}

export interface PerformanceRecord {
  videoId: string;
  date: ISODate;
  platform: Platform;
  branch: Branch;
  hookId: string;
  retention3s?: number; // 0..1
  ctr?: number; // 0..1
  conversion?: number; // 0..1
  note?: string;
}

export interface BrandPerformanceProfile {
  records: PerformanceRecord[];
  /** Rolling winners, promoted to defaults for the next video. */
  winningHooks: string[];
  winningBranches: Branch[];
  winningMusicMoods: string[];
  archived: string[];
}

export interface BrandProfile {
  brand: string;
  /** Product category drives the compliance ruleset. */
  category: "shapewear" | "beauty" | "apparel" | "other";
  palette: Hex[];
  logo?: string;
  tone: string;
  captions: BrandCaptionsProfile;
  voice: BrandVoiceProfile;
  imageRights: BrandImageRights;
  transitions: BrandTransitionsProfile;
  color: BrandColorProfile;
  copy: BrandCopyProfile;
  performance: BrandPerformanceProfile;
  /** Music mood map: 3–4 moods with generation tags. */
  musicMoods: MusicMood[];
  sonicLogo?: string;
  /** Marks fields that degraded (scraping failed) so the report is honest. */
  degraded?: string[];
}

// ---------------------------------------------------------------------------
// Intake questionnaire (Module 4)
// ---------------------------------------------------------------------------

export interface Intake {
  objective: string;
  platforms: Platform[];
  audience: string;
  productAngle: string;
  cta: string;
  durationSec: Seconds;
  restrictions?: string;
  market: Market;
  paid: boolean;
  adPlatforms: Platform[];
  ratios: AspectRatio[];
}

// ---------------------------------------------------------------------------
// Captions (Module 3)
// ---------------------------------------------------------------------------

/** Commercial function of a caption token. Drives styling & emphasis. */
export type CaptionClass =
  | "keyword_beneficio"
  | "numero_dato"
  | "nombre_producto"
  | "accion_cta"
  | "conector"
  | "negacion_dolor";

/** Typographic level. */
export type CaptionLevel = "H1" | "H2" | "base";

export interface CaptionToken {
  text: string;
  klass: CaptionClass;
  /** True for the single emphasised word in a block (max 1). */
  emphasised: boolean;
}

export interface CaptionBlock {
  id: string;
  tokens: CaptionToken[];
  level: CaptionLevel;
  startFrame: Frame;
  endFrame: Frame;
  /** Per-word karaoke timings, frame-relative to the composition. */
  wordFrames: { text: string; startFrame: Frame; endFrame: Frame }[];
  /** Resolved anchor after occlusion solving (normalised). */
  anchor: { x: number; y: number };
  entrance: "fade" | "pop" | "slide-up" | "typewriter";
  /** True if the block was nudged to align with a beat (<120ms). */
  beatAligned: boolean;
  /** Typographic voice for this block, independent of size level:
   *  display → h1Font (Montserrat), body → baseFont (Inter, informative),
   *  script → scriptFont (Playfair, aspirational). Defaults by level. */
  fontRole?: "display" | "body" | "script";
}

// ---------------------------------------------------------------------------
// Transitions (Module 6)
// ---------------------------------------------------------------------------

export type TransitionType =
  | "hard-cut"
  | "action-cut-whip"
  | "match-cut"
  | "invisible-cut"
  | "crossfade"
  | "luma-matte"
  | "shape-mask"
  | "zoom-punch"
  | "speed-ramp"
  | "glitch";

export interface TransitionDecisionInput {
  branch: Branch;
  platform: Platform;
  /** Energy of outgoing/incoming scenes, 0..1. */
  energyOut: number;
  energyIn: number;
  /** Narrative purpose of the boundary. */
  purpose: "continue" | "reveal" | "contrast" | "escalate" | "calm";
  /** Real footage motion at the boundary (from optical flow). */
  flowOut?: OpticalFlowSample;
  flowIn?: OpticalFlowSample;
  /** True if a composition/gesture match was detected across the cut. */
  matchDetected?: boolean;
  /** Beat frame nearest the boundary, if any. */
  beatFrame?: Frame;
  brand: BrandTransitionsProfile;
  /** How many flashy transitions already spent in this video. */
  flashyBudgetUsed: number;
  flashyBudgetMax: number;
}

export interface TransitionDecision {
  type: TransitionType;
  /** One-line justification, surfaced in the plan. */
  reason: string;
  /** SFX cue that must fire on the boundary frame (whoosh, impact...). */
  sfx?: string;
  /** True if this counts against the flashy budget. */
  flashy: boolean;
  durationFrames: Frame;
}

// ---------------------------------------------------------------------------
// Audio (Modules 7 & 9)
// ---------------------------------------------------------------------------

export interface MusicMood {
  name: string;
  tags: string[]; // genre / mood / instrumentation
  bpm: [number, number];
}

export type MusicSource =
  | "ace-step-original"
  | "free-multiplatform"
  | "tiktok-cml"
  | "meta-sound-collection"
  | "youtube-audio-library"
  | "general-sounds";

export interface MusicTrack {
  file: string;
  source: MusicSource;
  license: string;
  /** True only if cleared for PAID ads on ALL of intake.adPlatforms. */
  paidSafe: boolean;
  bpm?: number;
}

/** Attention-layer SFX (Module 9A). */
export type SfxKind =
  | "riser"
  | "impact"
  | "whoosh"
  | "tick-pop"
  | "sub-drop"
  | "notification-original"
  | "product-asmr"
  | "silence-cut";

export interface SfxCue {
  id: string;
  kind: SfxKind;
  file?: string;
  /** Generated originals carry no third-party license risk. */
  source: "generated" | "free-verified";
  license: string;
  /** Exact frame the SFX must land on. */
  frame: Frame;
  reason: string;
}

// ---------------------------------------------------------------------------
// Compliance (Module 10)
// ---------------------------------------------------------------------------

export type ComplianceLight = "green" | "yellow" | "red";

export interface ComplianceFinding {
  platform: Platform;
  light: ComplianceLight;
  rule: string;
  offending?: string;
  suggestion?: string;
}

export interface ComplianceReport {
  category: BrandProfile["category"];
  findings: ComplianceFinding[];
  /** Worst light across all findings; red blocks render. */
  overall: ComplianceLight;
}

// ---------------------------------------------------------------------------
// Video plan (Module 5) — the master, approvable document
// ---------------------------------------------------------------------------

export interface EnergyPoint {
  atSec: Seconds;
  energy: number; // 0..1
}

export interface Scene {
  id: string;
  clipId: string;
  inFrame: Frame;
  outFrame: Frame;
  /** Plain-language purpose, drives transitions and captions. */
  purpose: string;
  /** Line the model speaks (recorded) or that the system narrates. */
  vo?: { text: string; source: "recorded" | "cloned" };
  captions: CaptionBlock[];
  energy: number; // 0..1
  /** Public-relative clip path for the render (e.g. "clips/hook-2.mp4"). When
   *  absent the scene renders as a labelled placeholder. */
  src?: string;
  /** Mute the clip's own audio (e.g. B-roll whose recorded track is unusable;
   *  a cloned VO carries the line instead). */
  muteClipAudio?: boolean;
}

/** One styled line inside an ad-copy headline (not a karaoke subtitle). */
export interface CopyLine {
  text: string;
  /** display → Montserrat, body → Inter, script → Playfair. */
  font: "display" | "body" | "script";
  size: "xl" | "lg" | "md" | "sm";
  weight?: number;
  italic?: boolean;
  /** Whole-line colour role. */
  color?: "base" | "accent" | "highlight";
  /** A single word within the line to paint in the accent colour. */
  accentWord?: string;
  /** Brand copy treatment on this line: a hand-drawn ellipse around it (used to
   *  emphasise a key word/number, e.g. a discount), in the accent colour. */
  highlight?: "circle";
}

/**
 * Ad copy block — a designed headline (layered fonts, coloured key word, NO
 * plate), placed over negative space. This is advertising copy, not subtitles.
 */
export interface CopyBlock {
  id: string;
  startFrame: Frame;
  endFrame: Frame;
  /** Normalised anchor; align controls text-align + anchor meaning. */
  anchor: { x: number; y: number };
  align: "left" | "center";
  lines: CopyLine[];
  entrance: "fade-up" | "pop" | "none";
}

export interface Boundary {
  /** Index of the outgoing scene (transition sits between i and i+1). */
  fromScene: number;
  decision: TransitionDecision;
  /** Dominant optical-flow direction (deg) at the boundary, orients directional
   *  presentations (whip/match). From the motion analysis. */
  flowDeg?: number;
}

export interface RetentionPlan {
  /** Deliberate re-engagement beats at known drop-off points. */
  reHooks: { atSec: Seconds; kind: string; note: string }[];
  /** Longest gap without a visual change, in seconds (must be ≤ ~3). */
  maxDeadAirSec: Seconds;
}

export interface HookVariant {
  id: string;
  formulaId: string;
  text: string;
  /** Only the first ~3s differ across variants. */
  approxSec: Seconds;
}

export interface VideoPlan {
  version: number;
  brand: string;
  intake: Intake;
  branch: Branch;
  framework: CopyFramework;
  fps: number;
  durationFrames: Frame;
  scenes: Scene[];
  boundaries: Boundary[];
  energyCurve: EnergyPoint[];
  music: { plan: MusicMood; track?: MusicTrack };
  sfx: SfxCue[];
  retention: RetentionPlan;
  hookVariants: HookVariant[];
  compliance: ComplianceReport;
  /** Brand caption styling (fonts + colours) for the render; falls back to a
   *  neutral default when absent. */
  captionsProfile?: BrandCaptionsProfile;
  /** Designed ad-copy headlines (composition-relative), rendered over the
   *  footage instead of subtitle plates. */
  copy?: CopyBlock[];
  /** Brand outro tapa: base-colour ground, wordmark/logo, web + IG handle. */
  endCard?: {
    palette?: Hex[];
    logoSrc?: string;
    web?: string;
    instagram?: string;
    ink?: Hex;
    accent?: Hex;
  };
  /** Populated by the render/QC stage. */
  qc?: QCReport;
}

// ---------------------------------------------------------------------------
// QC & delivery (Modules 11 & 13)
// ---------------------------------------------------------------------------

export interface LoudnessMeasurement {
  integratedLUFS: number;
  truePeakDb: number;
  lra: number;
}

export interface QCCheck {
  name: string;
  pass: boolean;
  detail?: string;
}

export interface QCReport {
  checks: QCCheck[];
  loudness?: LoudnessMeasurement;
  pass: boolean;
}

export interface ExportSpec {
  ratio: AspectRatio;
  width: number;
  height: number;
  vcodec: "h264";
  profile: "high";
  bitrateMbps: [number, number];
  acodec: "aac";
  audioKbps: number;
  faststart: true;
}

export interface DeliveryItem {
  filename: string; // marca_producto_rama_hook-X_plataforma_ratio_duracion_vN.mp4
  ratio: AspectRatio;
  platform: Platform;
  hookId: string;
  srt: string;
  coverFrame: Frame;
}
