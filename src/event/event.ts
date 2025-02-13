import EventEmitter from "events";
import { AnimeDetail, AnimeSimple, Episode, Provider } from "../types";

export const event = new EventEmitter();

export const callGetAnimeDetail = (result: {
  provider: Provider;
  anime: AnimeDetail;
}) => {
  event.emit("get-anime-detail", result);
};

export const callGetAnimes = (result: {
  provider: Provider;
  animes: AnimeSimple[];
}) => {
  event.emit("get-animes", result);
};

export const callGetNewUpdate = (result: {
  provider: Provider,
  anime: AnimeDetail,
  episode: Episode
}) => {
  event.emit("on-new-update", result);
}
