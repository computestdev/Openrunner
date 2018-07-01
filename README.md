# Computest Openrunner
[![Build Status](https://travis-ci.org/computestdev/Openrunner.svg?branch=master)](https://travis-ci.org/computestdev/Openrunner) [![Coverage Status](https://coveralls.io/repos/github/computestdev/Openrunner/badge.svg?branch=master)](https://coveralls.io/github/computestdev/Openrunner?branch=master) [![Greenkeeper badge](https://badges.greenkeeper.io/computestdev/Openrunner.svg)](https://greenkeeper.io/)



Openrunner can be used for benchmark and functional testing for frontend-heavy web applications. It's a tool that simulates an end user using a website. It simulates user behaviour (keyboard/mouse activity) to browse through an online application. This can be used to test functionality and/or response times. Openrunner is a browser extension but can also be run from the command line i.e. for integration in a build pipeline.

## Getting started:

First of all, because this project is not an official browser extension yet, you will have to download and install Firefox Nightly: [https://nightly.mozilla.org/](https://nightly.mozilla.org/) (You can also use Firefox "Unbranded" or "Developer Edition", but not the regular firefox).

Then you must make sure that you have node.js installed (version 8 or higher): [https://nodejs.org/en/download/](https://nodejs.org/en/download/).

You can open the Openrunner IDE using your terminal:

```bash
npx openrunner ide --firefox '/Applications/Firefox Nightly.app/Contents/MacOS/firefox'
```
(Update the path to firefox as needed)

After executing this command, Firefox will launch and you can click on the Openrunner Icon ![](icons/openrunner-16.png) to start the Openrunner IDE.

Openrunner will launch with a small example script to get you started. The buttons on top of the screen can be used to open or save a script, execute or stop it. The two numbers are for the interval and the amount of runs you'd like to do (by default it's set to 1 run every 60 seconds), the last field is the current status.

After executing a script you'll be presented with the outcome. The top half of the screen shows the measured response times per step, and errors when/if they occur.

The bottom half of the screen shows the result of the run in json-format. Also, there's a 'view breakdown' button, this will open a complete breakdown of every step/event/object loaded that happened during the script execution.

Much more documentation on how to create scripts is available on the wiki on github: https://github.com/computestdev/Openrunner/wiki/Scripting-guide-(with-examples)

## Running scripts using your terminal
You can run saved scripts using your terminal:

```bash
npx openrunner run --firefox '/Applications/Firefox Nightly.app/Contents/MacOS/firefox' --script myScript.js --result myResult.json --headless
```

After this command has completed, you can inspect/parse all the results in the `myResult.json` file.
