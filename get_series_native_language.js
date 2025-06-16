const iso1to3 = {
  aa: "aar",
  ab: "abk",
  ae: "ave",
  af: "afr",
  ak: "aka",
  am: "amh",
  an: "arg",
  ar: "ara",
  as: "asm",
  av: "ava",
  ay: "aym",
  az: "aze",
  ba: "bak",
  be: "bel",
  bg: "bul",
  bh: "bih",
  bi: "bis",
  bm: "bam",
  bn: "ben",
  bo: "bod",
  br: "bre",
  bs: "bos",
  ca: "cat",
  ce: "che",
  ch: "cha",
  co: "cor",
  cr: "cre",
  cs: "ces",
  cu: "chu",
  cv: "chv",
  cy: "cym",
  da: "dan",
  de: "deu",
  dv: "div",
  dz: "dzo",
  ee: "ewe",
  el: "ell",
  en: "eng",
  eo: "epo",
  es: "spa",
  et: "est",
  eu: "eus",
  fa: "fas",
  ff: "ful",
  fi: "fin",
  fj: "fij",
  fo: "fao",
  fr: "fra",
  fy: "fry",
  ga: "gle",
  gd: "gla",
  gl: "glg",
  gn: "grn",
  gu: "guj",
  gv: "glv",
  ha: "hau",
  he: "heb",
  hi: "hin",
  ho: "hmo",
  hr: "hrv",
  ht: "hat",
  hu: "hun",
  hy: "hye",
  hz: "her",
  ia: "ina",
  id: "ind",
  ie: "ile",
  ig: "ibo",
  ii: "iii",
  ik: "ipk",
  io: "ido",
  is: "isl",
  it: "ita",
  iu: "iku",
  ja: "jpn",
  jv: "jav",
  ka: "kat",
  kg: "kon",
  ki: "kik",
  kj: "kua",
  kk: "kaz",
  kl: "kal",
  km: "khm",
  kn: "kan",
  ko: "kor",
  kr: "kau",
  ks: "kas",
  ku: "kur",
  kv: "kom",
  kw: "cor",
  ky: "kir",
  la: "lat",
  lb: "ltz",
  lg: "lug",
  li: "lim",
  ln: "lin",
  lo: "lao",
  lt: "lit",
  lu: "lub",
  lv: "lav",
  mg: "mlg",
  mh: "mah",
  mi: "mri",
  mk: "mkd",
  ml: "mal",
  mn: "mon",
  mr: "mar",
  ms: "msa",
  mt: "mlt",
  my: "mya",
  na: "nau",
  nb: "nob",
  nd: "nde",
  ne: "nep",
  ng: "ndo",
  nl: "nld",
  nn: "nno",
  no: "nor",
  nr: "nbl",
  nv: "nav",
  ny: "nya",
  oc: "oci",
  oj: "oji",
  om: "orm",
  or: "ori",
  os: "oss",
  pa: "pan",
  pi: "pli",
  pl: "pol",
  ps: "pus",
  pt: "por",
  qu: "que",
  rm: "roh",
  rn: "run",
  ro: "ron",
  ru: "rus",
  rw: "kin",
  sa: "san",
  sc: "srd",
  sd: "snd",
  se: "sme",
  sg: "sag",
  si: "sin",
  sk: "slk",
  sl: "slv",
  sm: "smo",
  sn: "sna",
  so: "som",
  sq: "sqi",
  sr: "srp",
  ss: "ssw",
  st: "sot",
  su: "sun",
  sv: "swe",
  sw: "swa",
  ta: "tam",
  te: "tel",
  tg: "tgk",
  th: "tha",
  ti: "tir",
  tk: "tuk",
  tl: "tgl",
  tn: "tsn",
  to: "ton",
  tr: "tur",
  ts: "tso",
  tt: "tat",
  tw: "twi",
  ty: "tah",
  ug: "uig",
  uk: "ukr",
  ur: "urd",
  uz: "uzb",
  ve: "ven",
  vi: "vie",
  vo: "vol",
  wa: "wln",
  wo: "wol",
  xh: "xho",
  yi: "yid",
  yo: "yor",
  za: "zha",
  zh: "zho",
  zu: "zul",
};

function getSeriesName(ffProbeData) {
  // 1. Try format tags
  if (
    ffProbeData.format &&
    ffProbeData.format.tags &&
    ffProbeData.format.tags.title
  ) {
    return ffProbeData.format.tags.title;
  }
  // 2. Try stream tags
  if (ffProbeData.streams) {
    for (const stream of ffProbeData.streams) {
      if (stream.tags && stream.tags.title) {
        return stream.tags.title;
      }
    }
  }
  return null; // No title found
}

async function getSeriesLanguage(seriesName, tmdbToken) {
  console.log("Fetching series language for:", seriesName);

  const getSeriesUrl = new URL("https://api.themoviedb.org/3/search/tv");
  getSeriesUrl.searchParams.append("query", seriesName);
  const seriesData = await fetch(getSeriesUrl, {
    headers: {
      Authorization: `Bearer ${tmdbToken}`,
    },
  });

  if (!seriesData.ok) {
    console.error("Failed to fetch series data");
    return null;
  }

  const seriesJson = await seriesData.json();
  const language = seriesJson.results[0]?.original_language || null;

  console.log("Native language for series returned: ", language);

  return language;
}

module.exports = async (args) => {
  const { ffProbeData } = args.inputFileObj; // Extract ffProbeData from the input file object

  const seriesName = getSeriesName(ffProbeData);
  if (!seriesName) {
    console.error("No series name found in ffProbeData");
    return {
      outputFileObj: args.inputFileObj,
      outputNumber: 2,
      variables: args.variables,
    };
  }

  const token = args.userVariables.global.tmdb_token;
  const language = await getSeriesLanguage(seriesName, token);
  const iso3Language = language ? iso1to3[language] : null;

  // Find audio stream with the specified language
  const stream = ffProbeData.streams
    .filter((s) => s.codec_type === "audio")
    .find((s) => s.tags?.language === iso3Language);
  const nativeIndex = stream ? stream.index : null;

  return {
    outputFileObj: args.inputFileObj,
    outputNumber: 1,
    variables: {
      ...args.variables,
      user: {
        ...args.variables.user,
        native_language: iso3Language,
        native_audio_index: nativeIndex,
      },
    },
  };
};
