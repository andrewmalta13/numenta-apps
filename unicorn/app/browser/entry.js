// Copyright © 2016, Numenta, Inc.  Unless you have purchased from
// Numenta, Inc. a separate commercial license for this software code, the
// following terms and conditions apply:
//
// This program is free software: you can redistribute it and/or modify it under
// the terms of the GNU Affero Public License version 3 as published by the Free
// Software Foundation.
//
// This program is distributed in the hope that it will be useful, but WITHOUT
// ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
// FOR A PARTICULAR PURPOSE. See the GNU Affero Public License for more details.
//
// You should have received a copy of the GNU Affero Public License along with
// this program.  If not, see http://www.gnu.org/licenses.
//
// http://numenta.org/licenses/

/**
 * @external {BaseStore} http://fluxible.io/addons/BaseStore.html
 */
/**
 * @external {FluxibleContext} http://fluxible.io/api/fluxible-context.html
 */
/**
 * @external {React.Component} https://facebook.github.io/react/docs/component-api.html
 */

import bunyan from 'bunyan';
import Fluxible from 'fluxible';
import FluxibleReact from 'fluxible-addons-react';
import batchedUpdatePlugin from 'fluxible-addons-react/batchedUpdatePlugin';
import ReactDOM from 'react-dom';
import remote from 'remote';
import tapEventInject from 'react-tap-event-plugin';

import config from './lib/HTMStudio/ConfigClient';
import CreateModelStore from './stores/CreateModelStore';
import databaseClient from './lib/HTMStudio/DatabaseClient';
import fileClient from './lib/HTMStudio/FileClient';
import FileDetailsStore from './stores/FileDetailsStore';
import FileStore from './stores/FileStore';
import HTMStudioPlugin from './lib/Fluxible/HTMStudioPlugin';
import loggerConfig from '../config/logger';
import MainComponent from './components/Main';
import MetricDataStore from './stores/MetricDataStore';
import MetricStore from './stores/MetricStore';
import ModelClient from './lib/HTMStudio/ModelClient';
import ModelDataStore from './stores/ModelDataStore';
import ModelStore from './stores/ModelStore';
import ParamFinderClient from './lib/HTMStudio/ParamFinderClient';
import StartApplicationAction from './actions/StartApplication';
import {trims} from '../common/common-utils';

const dialog = remote.require('dialog');
const logger = bunyan.createLogger(loggerConfig);

let modelClient = new ModelClient();
let paramFinderClient = new ParamFinderClient();


/**
 * HTM Studio: Cross-platform Desktop Application to showcase basic HTM features
 *  to a user using their own data stream or files. Main browser web code
 *  Application GUI entry point.
 */
document.addEventListener('DOMContentLoaded', () => {
  let app, context;

  // global uncaught exception handler
  window.onerror = (message, file, line, col, error) => {
    dialog.showErrorBox('Unknown Error', `Unknown Error: ${message}`);
  };

  // verify web target
  if (!(document && ('body' in document))) {
    dialog.showErrorBox('Document Error', 'No document body found');
  }

  tapEventInject(); // @TODO remove when >= React 1.0

  // init GUI flux/ible app
  app = new Fluxible({
    component: MainComponent,
    stores: [
      CreateModelStore, FileDetailsStore, FileStore, MetricDataStore,
      MetricStore, ModelDataStore, ModelStore
    ]
  });

  // Plug batchedUpdatePlugin
  app.plug(batchedUpdatePlugin);

  // Plug HTMStudio plugin giving access to HTMStudio clients
  app.plug(HTMStudioPlugin);

  // add context to app
  context = app.createContext({
    configClient: config,
    loggerClient: logger,
    databaseClient,
    fileClient,
    modelClient,
    paramFinderClient
  });

  // Start listening for model events
  modelClient.start(context.getActionContext());

  // Start listening for paramFinder events
  paramFinderClient.start(context.getActionContext());

  // app exit handler
  window.onbeforeunload = (event) => {
    let models = context.getStore(ModelStore).getModels();
    let active = models.filter((model) => model.active === true) || [];
    let modelCount = active.length || 0;
    let cancel;
    if (modelCount > 0) {
      cancel = dialog.showMessageBox({
        buttons: ['Quit', 'Cancel'],
        message: trims`There are still ${modelCount} active models
                  running. All models will be interrupted upon quitting, and
                  it won’t be possible to restart these models. All results
                  obtained so far will be persisted. Are you sure you want to
                  quit the app and stop all running models?`,
        title: 'Exit?',
        type: 'question'
      });
      if (!cancel) {
        // stop all active models before quitting
        active.forEach((model) => {
          modelClient.removeModel(model.modelId);
        });
      }
      return !cancel; // quit
    }
  };

  // fire initial app action to load all files
  context.executeAction(StartApplicationAction)
    .then(() => {
      let contextEl = FluxibleReact.createElementWithContext(context);
      let container = document.getElementById('main');
      ReactDOM.render(contextEl, container);
    })
    .catch((error) => {
      console.log(error); // eslint-disable-line
      dialog.showErrorBox('Startup Error', `Startup Error: ${error}`);
    });
}); // DOMContentLoaded
