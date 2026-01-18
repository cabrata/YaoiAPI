import {
  AnimeDetail,
  AnimeSimple,
  Batch,
  Character,
  Episode,
  Genre,
  Stream,
  ResponsePagination,
  AnimesParams,
  Schedules,
  Option,
  Provider,
} from "../index";
import axios from "axios";
import * as cheerio from "cheerio";
import cache from "../cache";
import { callGetAnimeDetail, callGetAnimes } from "../event/event";
const PREFIX_CACHE = "animasu";
const BASE_URL = process.env.ANIMASU_BASE_URL || "https://v0.animasu.app/";

async function getAnimes(
  params?: AnimesParams,
  option?: Option
): Promise<ResponsePagination> {
  try {
    const cacheKey = `${PREFIX_CACHE}-animes-${JSON.stringify(params)}`;
    const cachedData = cache.get<ResponsePagination>(cacheKey);
    if (cachedData && !option?.noCache) {
      callGetAnimes({
        provider: Provider.ANIMASU,
        animes: cachedData.data,
      });
      return cachedData;
    }

    const res = await axios.get(
      params?.search
        ? `${BASE_URL}/page/${params.page || 1}/`
        : `${BASE_URL}/pencarian/`,
      {
        params: {
          s: params?.search || "",
          halaman: params?.page || 1,
          urutan: params?.sort || "update",
          "genre[]":
            params?.genre !== undefined ? [params.genre] : params?.genres || [],
          "season[]":
            params?.season !== undefined
              ? [params.season]
              : params?.seasons || [],
          "karakter[]":
            params?.characterType !== undefined
              ? [params.characterType]
              : params?.characterTypes || [],
          status: params?.status || "",
          tipe: params?.type || "",
        },
      }
    );
    const $ = cheerio.load(res.data);
    const animes: AnimeSimple[] = [];

    $(".bs").each((index, el) => {
      const title = $(el).find(".tt").text().trim();
      const link = $(el).find("a").attr("href");

      const slug = link?.split("/")[4].trim() || "";

      const image =
        $(el).find("img").attr("data-src") || $(el).find("img").attr("src");
      const type = $(el).find(".typez").text().trim();
      const episode = $(el).find(".epx").text().trim();

      let status = $(el).find(".sb").text().trim();
      if (status == "🔥🔥🔥") {
        status = "ONGOING";
      } else if (status == "Selesai ✓") {
        status = "COMPLETE";
      } else {
        status = "UPCOMING";
      }

      animes.push({
        title,
        slug,
        image: image || "",
        type,
        episode,
        status: status as "COMPLETE" | "ONGOING" | "UPCOMING",
      });
    });
    const hasNext =
      $(".hpage .r").length > 0 || $(".pagination .next").length > 0;

    const data = {
      data: animes,
      hasNext,
    };

    cache.set(cacheKey, data);

    // call event
    callGetAnimes({
      provider: Provider.ANIMASU,
      animes: data.data,
    });
    return data;
  } catch (error) {
    console.error("Error saat mengambil data anime:", error);
    return {
      hasNext: false,
      data: [],
    };
  }
}

async function getAnime(
  slug: string,
  option?: Option
): Promise<AnimeDetail | undefined> {
  try {
    const cacheKey = `${PREFIX_CACHE}-anime-detail-${slug}`;
    const cachedData = cache.get<AnimeDetail>(cacheKey);
    if (cachedData && !option?.noCache) {
      callGetAnimeDetail({
        provider: Provider.ANIMASU,
        anime: cachedData,
      });
      return cachedData;
    }
    const res = await axios.get(`${BASE_URL}/anime/${slug}/`);

    const $ = cheerio.load(res.data);

    const infox = $(".infox");

    // Parsing data utama
    const title = infox.find("h1[itemprop='headline']").text().trim();
    const synonym = infox.find(".alter").text().trim();
    const synopsis = $(".sinopsis p").text().trim();
    let image = $(".bigcontent .thumb img").attr("src") || "";
    if(!image.includes("http")){
      image = `https:${image}`
    }
    const rating = $(".rating strong").text().trim() || "N/A";

    const trailer = $(".trailer iframe").attr("src")?.trim() || "";

    // Parsing genres
    const genres: Genre[] = [];
    infox
      .find(".spe span")
      .first()
      .find("a")
      .each((_, el) => {
        const genreUrl = $(el).attr("href");
        const genreName = $(el).text().trim();
        const genreSlug = genreUrl?.split("/")[4] || "";
        genres.push({
          name: genreName,
          slug: genreSlug,
        });
      });

    // Parsing status
    let status = "";
    infox.find(".spe span").each((_, el) => {
      const text = $(el).text().trim();
      if (text.toLowerCase().startsWith("status:")) {
        const value = text.split(":")[1]?.trim();
        status =
          value === "🔥🔥🔥"
            ? "ONGOING"
            : value === "Selesai ✓"
            ? "COMPLETE"
            : "UPCOMING";
      }
    });

    // Parsing elemen lain
    const aired = infox
      .find(".spe span.split")
      .filter((_, el) => $(el).text().toLowerCase().startsWith("rilis:"))
      .text()
      .split(":")[1]
      ?.trim();

    const type = infox
      .find(".spe span")
      .filter((_, el) => $(el).text().toLowerCase().startsWith("jenis:"))
      .text()
      .split(":")[1]
      ?.trim();

    const episode = infox
      .find(".spe span")
      .filter((_, el) => $(el).text().toLowerCase().startsWith("episode:"))
      .text()
      .split(":")[1]
      ?.trim();

    const duration = infox
      .find(".spe span")
      .filter((_, el) => $(el).text().toLowerCase().startsWith("durasi:"))
      .text()
      .split(":")[1]
      ?.trim();

    const author = infox
      .find(".spe span")
      .filter((_, el) => $(el).text().toLowerCase().startsWith("pengarang:"))
      .find("a")
      .text()
      .trim();

    const studio = infox
      .find(".spe span")
      .filter((_, el) => $(el).text().toLowerCase().startsWith("studio:"))
      .find("a")
      .text()
      .trim();

    const season = infox
      .find(".spe span")
      .filter((_, el) => $(el).text().toLowerCase().startsWith("musim:"))
      .find("a")
      .text()
      .trim();

    const posted = infox.find(".spe span[itemprop='author'] i").text().trim();

    const updateAt =
      infox
        .find(".spe span.split time[itemprop='dateModified']")
        .attr("datetime") || "";

    const episodes: Episode[] = [];
    $("#daftarepisode li").each((index, el) => {
      const a = $(el).find(".lchx a");
      const episode = a.text().trim();
      const url = a.attr("href") || "";
      const slug = url.split("/")[3] || "";
      episodes.push({
        episode,
        slug,
      });
    });

    const batches: Batch[] = [];
    $(".soraddlx .soraurlx").each((index, el) => {
      const resolution = $(el).find("strong").text().trim();
      $(el)
        .find("a")
        .each((_index, _el) => {
          const url = $(_el).attr("href") || "";
          const name = $(_el).text().trim();
          batches.push({
            name,
            resolution,
            url,
          });
        });
    });

    const characterTypes: Character[] = [];
    try {
      $("#tikar_shw a").each((index, el) => {
        const href = $(el).attr("href") || "";
        const name = $(el).text().trim();
        const slug = href.split("/")[4] || "";
        characterTypes.push({
          name,
          slug,
        });
      });
    } catch (er) {}

    const data = {
      slug,
      title,
      synonym,
      synopsis,
      image,
      rating: Number(rating.split(" ")[1]) || 0,
      author,
      genres,
      characterTypes,
      status,
      aired: aired || "Unknown",
      type: type || "Unknown",
      episode: episode || "Unknown",
      duration: duration || "Unknown",
      studio: studio || "Unknown",
      season: season || "Unknown",
      trailer,
      updateAt,
      episodes,
      batches,
    };
    cache.set(cacheKey, data);

    // call event
    callGetAnimeDetail({
      provider: Provider.ANIMASU,
      anime: data,
    });
    return data;
  } catch (error) {
    console.error("Error saat mengambil data anime:", error);
  }
}

async function getStreams(
  episodeSlug: string,
  option?: Option
): Promise<Stream[]> {
  try {
    const cacheKey = `${PREFIX_CACHE}-anime-streams-${episodeSlug}`;
    const cachedData = cache.get<Stream[]>(cacheKey);
    if (cachedData && !option?.noCache) {
      return cachedData;
    }
    const streams: Stream[] = [];
    const res = await axios.get(`${BASE_URL}/${episodeSlug}/`);
    const $ = cheerio.load(res.data);

    $(".mirror option").each((index, el) => {
      const value = $(el).attr("value")?.trim();
      if (value) {
        const name = $(el).text().trim();
        const $$ = cheerio.load(`<div>${atob(value)}</div>`);
        streams.push({
          name,
          url: $$("iframe").attr("src")?.trim() || "",
        });
      }
    });
    cache.set(cacheKey, streams);
    return streams;
  } catch (error) {
    console.error("Error saat mengambil data stream:", error);
    return [];
  }
}

async function getGenres(option?: Option): Promise<Genre[]> {
  try {
    const cacheKey = `${PREFIX_CACHE}-genres`;
    const cachedData = cache.get<Genre[]>(cacheKey);
    if (cachedData && !option?.noCache) {
      return cachedData;
    }
    const res = await axios.get(`${BASE_URL}/kumpulan-genre-anime-lengkap/`);
    const $ = cheerio.load(res.data);
    const genres: Genre[] = [];
    $(".genrepage a").each((index, el) => {
      const name = $(el).text().trim();
      const url = $(el).attr("href") || "";
      const slug = url.split("/")[4] || "";
      genres.push({
        name,
        slug,
      });
    });
    cache.set(cacheKey, genres);
    return genres;
  } catch (error) {
    console.error("Error saat mengambil data genre:", error);
    return [];
  }
}

async function getCharacters(option?: Option): Promise<Character[]> {
  try {
    const cacheKey = `${PREFIX_CACHE}-characters`;
    const cachedData = cache.get<Character[]>(cacheKey);
    if (cachedData && !option?.noCache) {
      return cachedData;
    }
    const res = await axios.get(`${BASE_URL}/kumpulan-tipe-karakter-lengkap/`);
    const $ = cheerio.load(res.data);
    const characters: Character[] = [];
    $(".genrepage a").each((index, el) => {
      const name = $(el).text().trim();
      const url = $(el).attr("href") || "";
      const slug = url.split("/")[4] || "";
      characters.push({
        name,
        slug,
      });
    });
    cache.set(cacheKey, characters);
    return characters;
  } catch (error) {
    console.error("Error saat mengambil data character:", error);
    return [];
  }
}

async function getAnimesByDay(
  day:
    | "senin"
    | "selasa"
    | "rabu"
    | "kamis"
    | "jumat"
    | "sabtu"
    | "minggu"
    | "random",
  option?: Option
): Promise<AnimeSimple[]> {
  try {
    const cacheKey = `${PREFIX_CACHE}-animes-by-jadwal-${day}`;
    const cachedData = cache.get<AnimeSimple[]>(cacheKey);
    if (cachedData && !option?.noCache) {
      callGetAnimes({
        provider: Provider.ANIMASU,
        animes: cachedData,
      });
      return cachedData;
    }
    const res = await axios.get(`${BASE_URL}/jadwal/`);
    const $ = cheerio.load(res.data);
    const animes: AnimeSimple[] = [];

    $(".bixbox").each((index, el) => {
      const $$ = $(el);
      const $day = ($$.find(".releases h3 span").text().trim() || "")
        .toLowerCase()
        .replace("update acak", "random")
        .replace("'", "");
      if ($day == day) {
        $(el)
          .find(".bs")
          .each((_index, _el) => {
            const $$$ = $(_el);

            const title = $$$.find(".tt").text().trim();
            const link = $$$.find("a").attr("href");

            const slug = link?.split("/")[4].trim() || "";

            const image =
              $$$.find("img").attr("data-src") || $$$.find("img").attr("src");
            const type = $$$.find(".typez").text().trim();
            const episode = $$$.find(".epx").text().trim();

            let status = $$$.find(".sb").text().trim();
            if (status == "🔥🔥🔥") {
              status = "ONGOING";
            } else if (status == "Selesai ✓") {
              status = "COMPLETE";
            } else {
              status = "UPCOMING";
            }

            animes.push({
              title,
              slug,
              image: image || "",
              type,
              episode,
              status: status as "COMPLETE" | "ONGOING" | "UPCOMING",
            });
          });
      }
    });
    callGetAnimes({
      provider: Provider.ANIMASU,
      animes,
    });
    cache.set(cacheKey, animes);
    return animes;
  } catch (error) {
    console.error("Error saat mengambil data anime:", error);
    return [];
  }
}

async function getScheduleAnimes(option?: Option): Promise<Schedules> {
  const schedules: Schedules = {
    senin: [],
    selasa: [],
    rabu: [],
    kamis: [],
    jumat: [],
    sabtu: [],
    minggu: [],
    random: [],
  };
  try {
    const cacheKey = `${PREFIX_CACHE}-schedule-animes`;
    const cachedData = cache.get<Schedules>(cacheKey);
    if (cachedData && !option?.noCache) {
      for (const key in cachedData) {
        callGetAnimes({
          provider: Provider.ANIMASU,
          animes: cachedData[key as keyof Schedules],
        });
      }
      return cachedData;
    }
    const res = await axios.get(`${BASE_URL}/jadwal/`);
    const $ = cheerio.load(res.data);

    $(".bixbox").each((index, el) => {
      const $$ = $(el);
      const $day = ($$.find(".releases h3 span").text().trim() || "")
        .toLowerCase()
        .replace("update acak", "random")
        .replace("'", "");

      const animes: AnimeSimple[] = [];
      $$.find(".bs").each((_index, _el) => {
        const $$$ = $(_el);

        const title = $$$.find(".tt").text().trim();
        const link = $$$.find("a").attr("href");

        const slug = link?.split("/")[4].trim() || "";

        const image =
          $$$.find("img").attr("data-src") || $$$.find("img").attr("src");
        const type = $$$.find(".typez").text().trim();
        const episode = $$$.find(".epx").text().trim();

        let status = $$$.find(".sb").text().trim();
        if (status == "🔥🔥🔥") {
          status = "ONGOING";
        } else if (status == "Selesai ✓") {
          status = "COMPLETE";
        } else {
          status = "UPCOMING";
        }

        animes.push({
          title,
          slug,
          image: image || "",
          type,
          episode,
          status: status as "COMPLETE" | "ONGOING" | "UPCOMING",
        });
      });

      // call event
      callGetAnimes({
        provider: Provider.ANIMASU,
        animes,
      });

      schedules[$day as keyof Schedules] = animes;
    });
    cache.set(cacheKey, schedules);
  } catch (error) {
    console.error("Error saat mengambil data jadwal:", error);
  }
  return schedules;
}

export async function getAnimesByAlphabet(
  alphabet: string,
  page: number = 1,
  option?: Option
): Promise<ResponsePagination> {
  try {
    const cacheKey = `${PREFIX_CACHE}-animes-by-alphabet-${alphabet}-${page}`;
    const cachedData = cache.get<ResponsePagination>(cacheKey);
    if (cachedData && !option?.noCache) {
      callGetAnimes({
        provider: Provider.ANIMASU,
        animes: cachedData.data,
      });
      return cachedData;
    }
    const res = await axios.get(`${BASE_URL}/daftar-anime/page/${page}/`, {
      params: {
        show: alphabet.toUpperCase(), // Convert alphabet to uppercase
      },
    });

    // Parse the HTML response using Cheerio
    const $ = cheerio.load(res.data);

    // Determine if there is a next page
    const hasNext =
      $(".hpage .r").length > 0 || $(".pagination .next").length > 0;

    // Array to store anime data
    const animes: AnimeSimple[] = [];

    // Iterate through each element matching the class .bx
    $(".bx").each((index, el) => {
      const $$ = $(el);

      // Extract image data
      const image = $$.find(".imgx > a > img")?.attr("src")?.trim() || "";

      // Extract title and slug
      const title = $$.find(".inx h2 a").text().trim();
      let slug = $$.find(".inx h2 a").attr("href") || "";
      slug = slug.substring(0, slug.lastIndexOf("/")).split("/").pop() || "";

      // Extract type
      const type = $($$.find(".inx span").get(3)).text().trim();

      // Extract episode
      const episode = $($$.find(".inx span").get(4))
        .text()
        .trim()
        .replace(", ", "");

      // Extract status
      const status = $$.find(".inx span:contains('[Selesai]')").length
        ? "COMPLETE"
        : $$.find(".inx span:contains('Ongoing')").length
        ? "ONGOING"
        : "UPCOMING";

      animes.push({
        title,
        slug,
        image,
        type,
        episode,
        status,
      });
    });

    const result = {
      hasNext,
      data: animes,
    };

    cache.set(cacheKey, result);

    callGetAnimes({
      provider: Provider.ANIMASU,
      animes: result.data,
    });
    return result;
  } catch (error) {
    console.error("Error fetching anime data:", error);

    return {
      hasNext: false,
      data: [],
    };
  }
}

// async function getNewUpdate(): Promise<AnimeDetail | undefined> {
//   try {
//     const resCbox = await axios.get(
//       `https://www5.cbox.ws/box/?boxid=946129&boxtag=dHK21Z`
//     );
//     const $ = cheerio.load(resCbox.data);
//     let messagers = $(".msg");
//     const el = messagers.get(messagers.length - 1);
//     const $$ = $(el);
//     const isBot = $$.find(".nme").text().trim() === "Bot Animasu";
//     const isUpdate = $$.find(".body").text().trim().includes("Update:");

//     if (isBot && isUpdate) {
//       const epsUrl = $$.find(".body a").attr("href");
//       const epsSlug = epsUrl?.split("/")[3];

//       const 
//       if(epsSlug?.includes("-episode-")){

//       }

//       const animeSlug = epsSlug?.split("-episode-")[0].replace("nonton-", "");

//       if(animeSlug && epsSlug){
//         const anime = await getAnime(animeSlug || "");

        
//       }
//     }     
//     // const lastMessage = messagers.get(messagers.length - 1);
//     // console.log($(lastMessage).text().trim());
//   } catch (error) {
//     console.error("Error saat mengambil data anime:", error);
//     return;
//   }
// }

export default {
  getAnimes,
  getAnime,
  getStreams,
  getGenres,
  getCharacters,
  getAnimesByDay,
  getScheduleAnimes,
  getAnimesByAlphabet,
  // getNewUpdate,
};
