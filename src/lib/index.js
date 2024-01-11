
'use strict';

const { basename, join } = require('path');
const { exists, mkdir } = require('fs');
const { mkdirsSync, copy } = require('fs-extra');

const { spawn } = require('child_process');

const homedir = require('os-homedir');

const glob = require('glob');

const Flow = require('node-async-flow');

const NWD = require('@manim-finance/nwjs-download');

const { ExtractZip, ExtractTarGz } = require('./util');

const DIR_CACHES = join(homedir(), '.nwjs-builder', 'caches');
mkdirsSync(DIR_CACHES);

// Extracted flag.
const FILENAME_DONE = '.done';

const GetExecutable = (binaryDir, platform) => {

    switch(platform) {
    case 'win32':
    case 'win-ia32':
    case 'win-x64':
        return join(binaryDir, 'nw.exe');
    case 'linux':
    case 'linux-ia32':
    case 'linux-x64':
        return join(binaryDir, 'nw');
    case 'darwin':
    case 'osx-ia32':
    case 'osx-x64':
        return join(binaryDir, 'nwjs.app/Contents/MacOS/nwjs');
    default:
        // FIXME: Application exits sliently.
        //throw new Error('ERROR_WHAT_THE_FUCK');
        return null;
    }

};

const ExtractBinary = (path, callback) => {

    Flow(function*(cb) {

        var destination = null;
        var extract = null;

        if(path.endsWith('.zip')) {
            destination = join(DIR_CACHES, basename(path).slice(0, -4));
            extract = ExtractZip;
        }
        else if(path.endsWith('.tar.gz')) {
            destination = join(DIR_CACHES, basename(path).slice(0, -7));
            extract = ExtractTarGz;
        }
        else {
            return callback(new Error('ERROR_EXTENSION_NOT_SUPPORTED'));
        }

        const done = join(destination, FILENAME_DONE);

        const doneExists = yield exists(done, cb.single);

        if(doneExists) {
            return callback(null, true, destination);
        }
        else {
            return extract(path, destination, (err, destination) => {

                if(err) {
                    return callback(err);
                }

                mkdir(done, (err) => {

                    if(err) {
                        return callback(err);
                    }

                    return callback(null, false, destination);

                });

            });
        }

    });

};

const DownloadAndExtractBinary = ({
    version = null,
    platform = null,
    arch = null,
    flavor = null,
    mirror = null
}, callback) => {

    // Download nw.js.

    NWD.DownloadBinary({
        version, platform, arch, flavor, mirror,
        showProgressbar: true
    }, (err, fromCache, path) => {

        if(err) {
            return callback(err);
        }

        // Extract nw.js.

        ExtractBinary(path, (err, fromDone, binaryDir) => {

            if(err) {
                return callback(err);
            }

            callback(err, fromCache, fromDone, binaryDir);

        });

    });

};

const DownloadAndExtractFFmpeg = (destination, {
    version = null,
    platform = null,
    arch = null
}, callback) => {

    // Download ffmpeg.

    NWD.DownloadFFmpeg({
        version, platform, arch,
        showProgressbar: true
    }, (err, fromCache, path) => {

        if(err) {
            return callback(err);
        }

        // Extract ffmpeg.

        ExtractZip(path, destination, (err, destination) => {

            if(err) {
                return callback(err);
            }

            callback(err, fromCache, destination);

        });

    });

};

const InstallFFmpeg = (sourceDir, destinationDir, platform, callback) => {

    if(platform == 'win32') {

        copy(join(sourceDir, 'ffmpeg.dll'), join(destinationDir, 'ffmpeg.dll'), {
            clobber: true
        }, callback);

    }
    else if(platform == 'linux') {

        copy(join(sourceDir, 'libffmpeg.so'), join(destinationDir, 'lib', 'libffmpeg.so'), {
            clobber: true
        }, callback);

    }
    else if(platform == 'darwin') {

        glob(join(destinationDir, 'nwjs.app/**/libffmpeg.dylib'), {}, (err, files) => {

            if(err) {
                return calback(err);
            }

            if(files && files[0]) {

                // Overwrite libffmpeg.dylib.

                copy(join(sourceDir, 'libffmpeg.dylib'), files[0], {
                    clobber: true
                }, callback);

            }

        });

    }
    else {

        return callback(new Error('ERROR_PLATFORM_NOT_SUPPORTED'));

    }

};

const LaunchExecutable = (executable, args, detached, callback) => {

    const cp = spawn(executable, args, {
        stdio: detached ? 'ignore' : 'pipe',
        detached: detached
    });

    if(!cp) return callback(new Error('ERROR_LAUNCH_FAILED'));

    if(detached) {

        cp.unref();

    }
    else {

        cp.stdout.on('data', (data) => console.log(data.toString()));
        cp.stderr.on('data', (data) => console.error(data.toString()));

    }

    cp.on('close', (code) => callback(null, code));

};

Object.assign(module.exports, {
    util: require('./util'),
    commands: require('./commands'),
    GetExecutable,
    ExtractBinary,
    DownloadAndExtractBinary,
    DownloadAndExtractFFmpeg,
    InstallFFmpeg,
    BuildWin32Binary: require('./build/win32'),
    BuildLinuxBinary: require('./build/linux'),
    BuildDarwinBinary: require('./build/darwin'),
    LaunchExecutable
});
