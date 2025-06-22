"use strict";

const details = () => ({
  name: "Filter Languages And Set Defaults",
  description: `Removes audio tracks that are not in the native language or are not English, and sets the first English (if any) subtitle to be the default.
    Native language is determined by the Sonarr/Radarr API.`,
  tags: "audio",
  style: {
    borderColor: "#6efefc",
  },
  isStartPlgin: false,
  pType: "",
  requiresVersion: "2.11.01",
  sidebarPosition: -1,
  icon: "",
  inputs: [
    {
      name: "provider",
      type: "string",
      defaultValue: "Sonarr",
      inputUI: {
        type: "dropdown",
        options: ["Sonarr", "Radarr"],
      },
      tooltip:
        "Select the metadata provider, which is either Radarr or Sonarr.",
    },
    {
      name: "radarr_api_key",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
        displayConditions: {
          logic: "AND",
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Radarr",
                  condition: "===",
                },
              ],
            },
          ],
        },
      },
      tooltip: "Input your Radarr api key here.",
    },
    {
      name: "radarr_url",
      type: "string",
      defaultValue: "http://192.168.1.2:7878",
      inputUI: {
        type: "text",
        displayConditions: {
          logic: "AND",
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Radarr",
                  condition: "===",
                },
              ],
            },
          ],
        },
      },
      tooltip:
        "Input your full Radarr url here." +
        "\\nExample:\\n" +
        "http://192.168.1.2:7878\\n" +
        "https://radarr.example.com",
    },
    {
      name: "sonarr_api_key",
      type: "string",
      defaultValue: "",
      inputUI: {
        type: "text",
        displayConditions: {
          logic: "AND",
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Sonarr",
                  condition: "===",
                },
              ],
            },
          ],
        },
      },
      tooltip: "Input your Sonarr api key here.",
    },
    {
      name: "sonarr_url",
      type: "string",
      defaultValue: "http://192.168.1.2:8989",
      inputUI: {
        type: "text",
        displayConditions: {
          logic: "AND",
          sets: [
            {
              logic: "AND",
              inputs: [
                {
                  name: "provider",
                  value: "Sonarr",
                  condition: "===",
                },
              ],
            },
          ],
        },
      },
      tooltip:
        "Input your full Sonarr url here." +
        "\\nExample:\\n" +
        "http://192.168.1.2:8989\\n" +
        "https://sonarr.example.com",
    },
  ],
  outputs: [
    {
      number: 1,
      tooltip: "Ran successfully. Continue to the next plugin.",
    },
    {
      number: 2,
      tooltip: "No streams were removed, so no work needs to be done.",
    },
  ],
});

const extractTmdbId = (str) => {
  // Matches [tmdbid-<id>] where <id> is one or more digits
  const match = str.match(/\[tmdbid-(\d+)\]/i);
  return match ? match[1] : null;
};

const extractTvdbId = (str) => {
  // Matches [tvdbid-<id>] where <id> is one or more digits
  const match = str.match(/\[tvdbid-(\d+)\]/i);
  return match ? match[1] : null;
};

const setStreamDefault = (args, streamType, defaultValue) => {
  // Yes, Tdarr spells this 'Ouput'
  args.variables.ffmpegCommand.overallOuputArgs.push(
    `-disposition:${streamType}:{outputTypeIndex}`,
    defaultValue
  );
};

const clearOtherDefaultStreams = (
  args,
  defaultAudioStream,
  defaultSubtitleStream
) => {
  // If we find a stream that is marked as default, but not the one we set as default, we need to clear it.
  // This is to ensure that we only have one default audio and one default subtitle stream.
  for (const stream of args.variables.ffmpegCommand.streams) {
    if (stream.removed) continue; // Skip removed streams

    if (!stream.tags) {
      continue;
    }

    args.jobLog(
      `Checking ${stream.codec_type} stream '${stream.index}' with language '${
        stream.tags.language
      }' and disposition '${JSON.stringify(stream.disposition)}'`
    );

    if (stream.disposition.default) {
      args.jobLog(
        `Found default ${stream.codec_type} stream '${stream.index}' with language '${stream.tags.language}'`
      );
      if (
        defaultAudioStream &&
        stream.codec_type === "audio" &&
        stream.index !== defaultAudioStream.index
      ) {
        setStreamDefault(args, "a", "0");
        args.jobLog(
          `Found default audio stream that was different than the one we marked. Clearing...`
        );
      } else if (
        defaultSubtitleStream &&
        stream.codec_type === "subtitle" &&
        stream.index !== defaultSubtitleStream.index
      ) {
        setStreamDefault(args, "s", "0");
        args.jobLog(
          `Found default subtitle stream that was different than the one we marked. Clearing...`
        );
      }
    }
  }
};

// Returns true if any stream was removed, false otherwise.
const filterTracks = (args, langsToKeep, nativeLanguage) => {
  args.jobLog("Filtering audio tracks for file: " + args.inputFileObj._id);
  args.jobLog("Languages to keep: " + langsToKeep);

  let removedStream = false;
  let defaultAudioStream = null;
  let defaultSubtitleStream = null;

  for (const stream of args.variables.ffmpegCommand.streams) {
    args.jobLog(
      `Processing ${stream.codec_type} stream with index '${stream.index}'`
    );

    if (stream.codec_type !== "audio" && stream.codec_type !== "subtitle") {
      args.jobLog("Stream is not audio nor subtitle, skipping");
      continue;
    }

    if (!stream.tags) {
      args.jobLog("Stream has no tags, skipping");
      continue;
    }

    const streamLanguage = stream.tags.language;
    if (!streamLanguage) {
      args.jobLog("Stream has no language tag, skipping");
      continue;
    }

    // We only want to remove audio streams.
    if (
      !langsToKeep.includes(streamLanguage) &&
      stream.codec_type === "audio"
    ) {
      stream.removed = true;
      removedStream = true;
      args.jobLog(
        `Removed ${stream.codec_type} stream with index '${stream.index}' and language '${streamLanguage}'`
      );
      continue;
    }

    if (streamLanguage === nativeLanguage) {
      if (!defaultAudioStream && stream.codec_type === "audio") {
        setStreamDefault(args, "a", "default");
        defaultAudioStream = stream;
        args.jobLog(
          `Setting default audio stream with index '${stream.index}' and language '${streamLanguage}'.`
        );
      }
    }

    if (streamLanguage === "eng") {
      if (!defaultSubtitleStream && stream.codec_type === "subtitle") {
        setStreamDefault(args, "s", "default");
        defaultSubtitleStream = stream;
        args.jobLog(
          `Setting default subtitle stream with index '${stream.index}' and language '${streamLanguage}'.`
        );
      }
    }

    args.jobLog(
      `Keeping stream with index '${stream.index}' and language '${streamLanguage}' since it is in the allowed languages.`
    );
  }

  // We have to go through the streams again, since there might default streams before the one we set as default.
  clearOtherDefaultStreams(args, defaultAudioStream, defaultSubtitleStream);

  if (!removedStream) {
    args.jobLog("No streams were removed. No work needs to be done.");
  }

  return removedStream;
};

// Returns result from track filtering.
const handle_media_response = (args, mediaJson) => {
  const langs = require("langs");

  const nativeLanguage = mediaJson.originalLanguage.name;
  args.jobLog(`Found native language in media: ${nativeLanguage}`);

  const nativeLanguageCode = langs.where("name", nativeLanguage);
  if (!nativeLanguageCode) {
    const err = `Could not get language code for '${nativeLanguage}'! Language was not found.`;
    args.jobLog(err);
    throw new Error(err);
  }

  const nativeLanguageThreeLetters = nativeLanguageCode[3];
  args.jobLog(
    `Native language three-letter code: ${nativeLanguageThreeLetters}`
  );

  const langsToKeep = [
    nativeLanguageThreeLetters,
    // Add English if the native language is not English
    ...(nativeLanguageThreeLetters !== "eng" ? ["eng"] : []),
  ];

  return filterTracks(args, langsToKeep, nativeLanguageThreeLetters);
};

const fetchMedia = async (args, endpoint, auth) => {
  args.jobLog("Fetching media from " + endpoint.href);

  let response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
      },
    });
  } catch (error) {
    const err =
      `Error while sending request to fetch media from '${endpoint.href}'! ` +
      error.message;
    args.jobLog(err);
    throw new Error(err);
  }

  if (!response.ok) {
    const err =
      `Failed to fetch media from '${endpoint.href}': ` + response.statusText;
    args.jobLog(err);
    throw new Error(err);
  }

  const responseJson = await response.json();
  return responseJson[0];
};

const do_sonarr = async (args) => {
  args.jobLog("Running Sonarr strategy...");

  const sonarrApiKey = args.inputs.sonarr_api_key;
  if (!sonarrApiKey) {
    args.jobLog("Sonarr API key is not set!");
    throw new Error("Sonarr API key is not set!");
  }

  let filePath = args.inputFileObj._id;
  let tvdbId = extractTvdbId(filePath);
  if (!tvdbId) {
    args.jobLog("TVDB ID not found in file name: " + filePath);
    throw new Error("TVDB ID not found in file name.");
  }

  const seriesEndpoint = new URL("/api/v3/series", args.inputs.sonarr_url);
  seriesEndpoint.searchParams.append("tvdbid", tvdbId);
  seriesEndpoint.searchParams.append("includeSeasonImages", "false");

  const series = await fetchMedia(args, seriesEndpoint, sonarrApiKey);
  if (!series) {
    const err = `Series not found for TVDB ID: ${tvdbId}`;
    args.jobLog(err);
    throw new Error(err);
  }
  args.jobLog("Fetched series data from Sonarr: " + series);

  return handle_media_response(args, series);
};

const do_radarr = async (args) => {
  args.jobLog("Running Radarr strategy...");

  const radarrApiKey = args.inputs.radarr_api_key;
  if (!radarrApiKey) {
    args.jobLog("Radarr API key is not set!");
    throw new Error("Radarr API key is not set!");
  }

  let filePath = args.inputFileObj._id;
  let tmdbid = extractTmdbId(filePath);
  if (!tmdbid) {
    args.jobLog("TMDB ID not found in file name: " + filePath);
    throw new Error("TMDB ID not found in file name.");
  }

  const movieEndpoint = new URL("/api/v3/movie", args.inputs.radarr_url);
  movieEndpoint.searchParams.append("tmdbid", tmdbid);
  movieEndpoint.searchParams.append("excludeLocalCovers", "true");

  const movie = await fetchMedia(args, movieEndpoint, radarrApiKey);
  if (!movie) {
    const err = `Movie not found for TMDB ID: ${tmdbid}`;
    args.jobLog(err);
    throw new Error(err);
  }
  args.jobLog("Fetched movie data from Radarr: " + movie);

  return handle_media_response(args, movie);
};

const plugin = async (args) => {
  const lib = require("../../../../../methods/lib")();
  args.inputs = lib.loadDefaultValues(args.inputs, details);

  const flowUtils = require("../../../../FlowHelpers/1.0.0/interfaces/flowUtils");
  flowUtils.checkFfmpegCommandInit(args);

  await args.installClassicPluginDeps(["langs@2.0.0"]);

  const strategies = {
    sonarr: do_sonarr,
    radarr: do_radarr,
  };
  const strategyToExecute = args.inputs.provider.toLowerCase();
  const needs_work = await strategies[strategyToExecute](args);

  return {
    outputFileObj: args.inputFileObj,
    outputNumber: needs_work ? 1 : 2,
    variables: args.variables,
  };
};

module.exports.details = details;
module.exports.plugin = plugin;
