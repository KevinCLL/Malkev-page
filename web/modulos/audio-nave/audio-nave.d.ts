// Tipos de audio-nave.js (para Astro / TypeScript).

export type RoomId =
  | 'pasillo' | 'maquinas' | 'recreativa' | 'proyeccion' | 'bitacora'
  | 'juegos' | 'biblioteca' | 'ordenador' | 'puente';
export type Surface = 'metal' | 'rejilla' | 'moqueta' | 'madera';
export type Layer = 'master' | 'motores' | 'ambiente' | 'musica' | 'efectos'
  | 'engine' | 'ambient' | 'music' | 'fx' | 'sfx';
export type Texture = 'turbine' | 'projector' | 'servers' | 'stars' | 'clock' | null;
export type AmbientEvent = 'blip' | 'hiss' | 'creak' | 'chirp' | 'tick' | 'typing' | 'dice';

export interface RoomDef {
  name: string;
  mood: string;
  root: number;
  tempo: number;
  chordBeats: number;
  chords: number[][];
  scale: number[];
  pad: { wave: OscillatorType; cutoff: number; detune: number; level: number };
  bell: { density: number; wave: 'bell' | 'musicbox' | 'pluck' | 'square' | 'sine'; octave: number; decay: number; pattern?: 'arp' };
  engine: number;
  air: number;
  airCutoff: number;
  music: number;
  reverb: number;
  floor: Surface;
  texture: Texture;
  events: Partial<Record<AmbientEvent, number>>;
}

export interface AudioNaveState {
  ready: boolean;
  running: boolean;
  room: string | null;
  roomName: string | null;
  floor: Surface | null;
  volumes: { master: number; motores: number; ambiente: number; musica: number; efectos: number };
  muted: boolean;
  walking: boolean;
  voices: number;
}

export interface InitOptions {
  room?: RoomId | string;
  fade?: number;
  volumes?: Partial<Record<Layer, number>>;
  pauseWhenHidden?: boolean;
}

export const ROOMS: Record<RoomId, RoomDef> & Record<string, RoomDef>;
export const SURFACES: Surface[];
export function init(opts?: InitOptions): Promise<AudioNaveState>;
export function setRoom(id: RoomId | string, opts?: { fade?: number }): void;
export function playDoor(kind?: 'open' | 'close', opts?: { pan?: number }): void;
export function footstep(opts?: { surface?: Surface; intensity?: number; pan?: number }): void;
export function setWalking(on: boolean, opts?: { rate?: number; surface?: Surface }): void;
export function beep(kind?: 'ok' | 'error'): void;
export function setVolume(layer: Layer, value: number): void;
export function getVolume(layer: Layer): number;
export function setMuted(muted: boolean): void;
export function getAnalyser(): AnalyserNode | null;
export function getState(): AudioNaveState;
export function onChange(fn: (state: AudioNaveState) => void): () => void;
export function dispose(): Promise<void>;

declare const AudioNave: {
  ROOMS: typeof ROOMS; SURFACES: typeof SURFACES;
  init: typeof init; setRoom: typeof setRoom; playDoor: typeof playDoor; footstep: typeof footstep;
  setWalking: typeof setWalking; beep: typeof beep; setVolume: typeof setVolume; getVolume: typeof getVolume;
  setMuted: typeof setMuted; getAnalyser: typeof getAnalyser; getState: typeof getState;
  onChange: typeof onChange; dispose: typeof dispose;
};
export default AudioNave;
