const rp = require('request-promise');
const { client_id, directories, resizing_resolutions } = require('./config.json');
const ffmpeg = require('fluent-ffmpeg');
const getFileFromUrl = require("@appgeist/get-file-from-url");
const getDimensions = require('get-video-dimensions');
const shelljs = require('shelljs');

module.exports = {
    /**
    * Retrieve a certain amount of top clips for a game on twitch.
    * @param {Integer} gameID The game id to get the clips from.
    * @param {Integer} amount Amount of clips to fetch. 
    * @returns {Promise<Object>}
    */
    getClips: (gameID, amount = 30) => {
        return new Promise(resolve => {
            rp({
                uri: `https://api.twitch.tv/helix/clips?game_id=${gameID}&first=${amount}&started_at=${(new Date(Date.now() - (60 * 60 * 24 * 7 * 1000))).toISOString()}`,
                method: 'GET',
                headers: { 
                    'Client-ID': client_id
                }
            }).then(res => {
                resolve(JSON.parse(res));
            }).catch((e) => {
                console.log(`An error has occured in getClips: ${e}`);
                resolve(false);
            });
        });
    },

    /**
     * Get a game ID by name
     * @param {string} name The game name
     * @returns {Promise<Integer>}
     */
    getGameID: (name) => {
        return new Promise(resolve => {
            rp({
                uri: `https://api.twitch.tv/helix/games?name=${name}`,
                method: 'GET',
                headers: { 
                    'Client-ID': client_id
                }
            }).then(res => {
                resolve(JSON.parse(res).data[0].id);
            }).catch((e) => {
                console.log(`An error has occured in getGameID: ${e}`);
                resolve(false);
            });
        });
    },

    /**
    * Retrieve a certain amount of top clips for a user.
    * @param {Integer} userID The user id to get the clips from.
    * @param {Integer} amount Amount of clips to fetch. 
    * @returns {Promise<Object>}
    */
    getUserClips: (userID, amount = 30) => {
        return new Promise(resolve => {
            rp({
                uri: `https://api.twitch.tv/helix/clips?broadcaster_id=${userID}&first=${amount}&started_at=${(new Date(Date.now() - (60 * 60 * 24 * 7 * 1000))).toISOString()}`,
                method: 'GET',
                headers: { 
                    'Client-ID': client_id
                }
            }).then(res => {
                resolve(JSON.parse(res));
            }).catch((e) => {
                console.log(`An error has occured in getUserClips: ${e}`);
                resolve(false);
            });
        });
    },

    /**
     * Get a user ID by username
     * @param {string} name The username
     * @returns {Promise<Integer>}
     */
    getUserID: (name) => {
        return new Promise(resolve => {
            rp({
                uri: `https://api.twitch.tv/helix/users?login=${name}`,
                method: 'GET',
                headers: { 
                    'Client-ID': client_id
                }
            }).then(res => {
                resolve(JSON.parse(res).data[0].id);
            }).catch((e) => {
                console.log(`An error has occured in getUserID: ${e}`);
                resolve(false);
            });
        });
    },

    /**
    * Downloads a clip to the clips directory.
    * @param {Object} clip The clip object returned by the twitch api
    * @returns {Promise<void>}
    */
    downloadClip: (clip, name) => {
        return new Promise(resolve => {
            getFileFromUrl({
                url: clip.thumbnail_url.split('-preview-')[0] + '.mp4',
                file: `${directories.clips}/${name}.mp4`
            }).then(resolve);
        });
    },

    /**
    * Resizes a clip to 1920x1080
    * @param {string} clip The name of the clip.
    * @returns {Promise<void>}
    */
    resizeClip: (clip) => {
        return new Promise(async resolve => {
            const dimensions = await getDimensions(`${directories.clips}/${clip}`);

            if (dimensions.width != resizing_resolutions.width || dimensions.height != resizing_resolutions.height) {
                console.log(`Resizing ${clip}...`);
                
                await ffmpeg(`${directories.clips}/${clip}`)
                .output(`${directories.clips}/resized${clip}`)
                .videoCodec('libx264')
                .size(`${resizing_resolutions.width}x${resizing_resolutions.height}`)
                .on('error', (e) => {
                    console.log(`An error occurred: ${e.message}`);
                })
                .on('end', () => {
                    console.log(`Finished resizing ${clip}`);
                    resolve();
                })
                .run();
            } else {
                resolve();
            }
        });
    },

    /**
     * Adds the clip title and username to a clip
     * @param {Array} clips Array of clips
     * @param {string} clip Path to the clip file
     * @returns {Promise<void>}
     */
    addTextToClip: (clips, clip) => {
        return new Promise(resolve => {
            let fileName = clip.split('/')[clip.split('/').length - 1].split('.mp4')[0];
            if (fileName.split('resized').length > 1) fileName = fileName.split('resized')[1];
            const clipTitle = clips.data[Number(fileName)].title, broadcasterName = clips.data[Number(fileName)].broadcaster_name;
            const child = shelljs.exec(`ffmpeg -i ${clip} -vf "[in]drawtext=fontfile=./fonts/ProductSans.ttf:text='${broadcasterName}':fontcolor=white:fontsize=32:shadowcolor=black:shadowx=2:shadowy=2:x=(w-text_w)-15:y=(h-text_h)-15,drawtext=fontfile=./fonts/ProductSans.ttf:text='${clipTitle}':fontcolor=white:fontsize=32:shadowcolor=black:shadowx=2:shadowy=2:x=15:y=15" -codec:a copy -vsync 2 ${directories.clips}/text${fileName}.mp4 -y`, { async: true, silent: false });

            child.on('exit', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    console.log('An error has occured in addTextToClip.');
                }
            });
        });
    },

    /**
     * Concats videos
     * @param {Array} videos Array of video names
     */
    concatVideos: (videos) => {
        let cmd = 'ffmpeg';
        videos.forEach(f => cmd += ' -i ' + f);
        cmd += ` -filter_complex "[0:v:0][0:a:0][1:v:0][1:a:0]concat=n=${videos.length}:v=1:a=1[outv][outa]" -map "[outv]" -map "[outa]" -vsync 2 ${directories.output}/${Date.now()}.mp4`;

        let child = shelljs.exec(cmd, { async: true, silent: false });

        child.on('exit', (code, signal) => {
            if (code === 0) {
                console.log('Done! Video saved to the output folder.');
            } else {
                console.log('An error has occured.');
            }

            process.exit();
        });
    }
}