# Remove Non-Native Non-English Audio Tracks

A Tdarr flow plugin that removes non-native non-english audio tracks, and sets the native audio and subtitle track to be the default.

**IMPORTANT NOTE:** This REQUIRES you to follow the TRaSH guides naming convention by having the series TVDB id like so: [tvdbid-*id*] in the series root folder. And for movies you need the movie TMDB id in the file name like so: [tmdbid-*id*]

It gets the native language of the media via the Sonarr or Radarr API.
