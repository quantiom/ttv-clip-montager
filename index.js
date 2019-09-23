const { 
    getClips, 
    downloadClip, 
    resizeClip, 
    getGameID, 
    concatVideos, 
    addTextToClip,
    getUserClips,
    getUserID
} = require('./utils');
const { directories } = require('./config.json');
const readline = require('readline-promise').default;
const fs = require('fs-nextra');
const shelljs = require('shelljs');

const rlp = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true
});

(async () => {
    const userOrGame = await rlp.questionAsync('Get top clips by user, or game? [U, G]: ');

    let userID, gameID;

    if (userOrGame.toLowerCase() == 'g') {
        const gameName = await rlp.questionAsync('Game name (must be exact): ');
        gameID = await getGameID(encodeURIComponent(gameName));
    } else {
        const userName = await rlp.questionAsync('Username (must be exact): ');
        userID = await getUserID(userName);
    }

    const clipAmount = await rlp.questionAsync('Amount of clips to download/edit: ');

    if ((await fs.readdir(directories.clips)).length > 0) {
        const remove = await rlp.questionAsync('Remove all files from the clips directory? [Y, N]: ');

        if (remove.toLowerCase() == 'y') {
            console.log('Removing files...');
            fs.emptyDir(directories.clips).catch((e) => {
                console.log(`An error occured: ${e}`);
                process.exit();
            });
            console.log('Removed successfully.');
        }
    }

    const timeFrame = await rlp.questionAsync('Time frame to get the top clips from (ex: 1 week): ');
    const continueDownload = await rlp.questionAsync('[WARNING] Downloading the clips can take a large amount of space on your drive, continue? (F if you want to use the clips that are already downloaded) [Y, N, F]: ');
    const clips = gameID ? await getClips(gameID, clipAmount, timeFrame) : await getUserClips(userID, clipAmount, timeFrame);

    if (continueDownload.toLowerCase() == 'y') {
        for (let i = 0; i < clips.data.length; i++) {
            let clip = clips.data[i];
            console.log(`Downloading clip: ${clip.title}...`);
            await downloadClip(clip, i);
            console.log(`Done downloading ${clip.title}.`);
        }
    } else if (continueDownload.toLowerCase() != 'f') process.exit();
    
    const continueResize = await rlp.questionAsync('Resize videos? (this is required if you have just downloaded the clips) [Y, N]: ');

    let clipFiles = await fs.readdir(directories.clips);

    if (continueResize.toLowerCase() == 'y') {
        for (clip of clipFiles) {
            await resizeClip(clip);
        }

        clipFiles = await fs.readdir(directories.clips);
    }

    const resizedFiles = clipFiles.filter(f => f.startsWith('resized')).map(f => f.split('resized')[1]);
    let concatClipArr = [];

    for (file of clipFiles) {
        if (file.startsWith('resized')) continue;
        if (!file.endsWith('.mp4')) file += '.mp4';

        if (resizedFiles.includes(file)) {
            concatClipArr.push(`${directories.clips}/resized${file}`);
        } else {
            concatClipArr.push(`${directories.clips}/${file}`);
        };
    }

    console.log('Adding clip names and usernames to the videos...');

    for (clip of concatClipArr) {
        await addTextToClip(clips, clip);
    }

    clipFiles = await fs.readdir(directories.clips);

    const textEditedFiles = clipFiles.filter(f => f.startsWith('text')).map(f => `${directories.clips}/${f}`);

    console.log('Creating the final video, this may take a while...');

    concatVideos(textEditedFiles);
})();