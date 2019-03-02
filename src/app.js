import {LitElement, css, html} from 'lit-element';
import deepCopy from 'lodash.clonedeep';
import * as dialogPolyfill from 'dialog-polyfill';
import * as api from './api.js';
import * as audio from './audio.js';
import * as config from './config.js';
import * as storage from './storage.js';

const maxSecondsBeforePreviousMeansRestart = 3;

let lastDragSource;

// Track attributes.
const trackName = 'name';
const trackIndexedDbKey = 'indexedDbKey';

class DuaelmixDroppable extends LitElement {
  static get properties() {
    return {
      highlighted: { type: Boolean },
    };
  }

  constructor() {
    super();
    this.mouseoverSet = new Set();
  }

  buildDragDropDetail(target) {
    return {
      src: lastDragSource,
      dst: target,
    };
  }

  getHostTarget(target) {
    while (!target.shadowRoot && target) {
      target = target.parentNode;
      if (target instanceof ShadowRoot) {
        target = target.host;
      }
    }
    return target;
  }

  canDrop(src, dst) {
    if (src == dst) return false;
    if (src instanceof DuaelmixPlaylistTrack) {
      if (dst instanceof DuaelmixPlaylistTrackPair) return false;
      if (src.index == dst.index) {
        if (dst.subIndex > src.subIndex && !dst.present) {
          // Can't move driving track into its driven slot.
          return false;
        }
      }
    } else if (src instanceof DuaelmixPlaylistTrackPair) {
      if (dst instanceof DuaelmixPlaylistTrack) return false;
      if (dst instanceof DuaelmixPlaylistGap) {
        if ((src.index == dst.index) || (src.index + 1 == dst.index)) {
          // Can't move to the gaps above and below.
          return false;
        }
      }
    }
    return true;
  }

  updateHighlighted() {
    this.highlighted = this.mouseoverSet.size > 0;
  }

  onDragEnter(event) {
    const target = this.getHostTarget(event.target);
    if (target instanceof DuaelmixDroppable) {
      const {src, dst} = this.buildDragDropDetail(target);
      if (this.canDrop(src, dst)) {
        this.mouseoverSet.add(event.target);
        this.updateHighlighted();
        event.stopPropagation();
      }
    }
  }

  onDragLeave(event) {
    event.preventDefault();
    const target = this.getHostTarget(event.target);
    if (target instanceof DuaelmixDroppable) {
      this.mouseoverSet.delete(event.target);
      this.updateHighlighted();
    }
  }

  onDragOver(event) {
    event.preventDefault();
  }

  dispatchCustomDropEvent(detail) {
    this.dispatchEvent(new CustomEvent('custom-drop', {detail: detail}));
  }

  onDrop(event) {
    const target = this.getHostTarget(event.target);
    if (target instanceof DuaelmixDroppable) {
      event.preventDefault();
      event.stopPropagation();
      this.mouseoverSet.clear();
      this.updateHighlighted();
      const detail = this.buildDragDropDetail(target);
      this.dispatchCustomDropEvent(detail);
    }
  }
}

class DuaelmixDragableDroppable extends DuaelmixDroppable {
  onDragStart(event) {
    const target = this.getHostTarget(event.target);
    if (target instanceof DuaelmixDragableDroppable) {
      event.dataTransfer.setData('text', '');  // Firefox compliance.
      lastDragSource = target;
      event.stopPropagation();
    }
  }
}

class DuaelmixLevelMeter extends LitElement {
  static get properties() {
    return {
      level: { type: Number },
      selected: { type: Boolean, reflect: true },
    };
  }

  constructor() {
    super();
    this.level = 0.8;
    setInterval(this.decay.bind(this), 50);
  }

  attributeChangedCallback(name, oldVal, newVal) {
    super.attributeChangedCallback(name, oldVal, newVal);
    if (name == 'selected') {
      if (this.selected) {
        this.poll = setInterval(() => {
          this.level = audio.getLevel();
        }, 25);
      } else if (this.poll) {
        clearInterval(this.poll);
      }
    }
  }

  decay() {
    if (!this.selected && this.level > 0) {
      this.level -= Math.min(this.level / 10, 0.1);
    }
  }

  static get styles() {
    return css`
      :host {
        display: flex;
        height: 100%;
        padding: 1px;
        box-sizing: border-box;
      }

      div {
        width: 100%;
        align-self: flex-end;
      }
    `;
  }

  render() {
    const foregroundColorVar = this.selected
      ? '--foreground-color'
      : '--foreground-disabled-color';
    return html`
      <style>
        div {
          height: ${this.level*100}%;
          background: var(${foregroundColorVar});
        }
      </style>
      <div></div>`;
  }
}

customElements.define('duaelmix-level-meter', DuaelmixLevelMeter);

class DuaelmixPlaylistTrack extends DuaelmixDragableDroppable {
  static get properties() {
    return {
      index: { type: Number },
      selected: { type: Boolean },
      subIndex: { type: Number },
      track: { type: Array },
    };
  }

  static get styles() {
    return css`
      :host {
        --foreground-disabled-color: #929093;
      }
      .container {
        display: flex;
        flex-direction: row;
      }
      .align-bottom {
        align-self: flex-end;
      }
      .border {
        border-color: var(--foreground-disabled-color);
        border-style: solid;
        border-width: 2px;
      }
      .track-container {
        height: 30px;
      }
      .track {
        display: flex;
        flex-direction: column;
        justify-content: center;
        text-align: left;
        color: var(--foreground-disabled-color);
        cursor: pointer;
        font-family: "Supertext 02";
        font-size: 0.6em;
        padding-left: 10px;
        padding-right: 10px;
        width: 300px;
        height: 100%;
      }
      .meter-box-container {
        border-style: solid none solid solid;
        width: 6px;
        height: 30px;
      }
      .selected-border {
        border-color: var(--foreground-color);
      }
      .selected-text {
        color: var(--foreground-color);
      }
      .highlighted {
        background: var(--highlight-background-color);
        color: var(--highlight-foreground-color);
      }
    `;
  }

  render() {
    const highlightedClass = this.highlighted ? 'highlighted' : '';
    const selectedBorderClass = this.selected ? 'selected-border' : '';
    const selectedTextClass = this.selected ? 'selected-text' : '';
    return html`
      <div class="container"
          .draggable="${this.track ? true : false}"
          @dragenter="${this.onDragEnter}"
          @dragleave="${this.onDragLeave}"
          @dragstart="${this.onDragStart}"
          @dragover="${this.onDragOver}"
          @drop="${this.onDrop}">
        <div class="align-bottom border meter-box-container
            ${selectedBorderClass}">
          <duaelmix-level-meter
            ?selected="${this.selected}">
          </duaelmix-level-meter>
        </div>
        <div class="align-bottom border track-container
            ${selectedBorderClass}">
          <div class="track ${highlightedClass} ${selectedTextClass}">
            ${this.track ? this.track[trackName] : 'Drag track here to pair'}
          </div>
        </div>
      </div>`;
      
  }
}

customElements.define('duaelmix-playlist-track', DuaelmixPlaylistTrack);


class DuaelmixPlaylistTrackPair extends DuaelmixDragableDroppable {
  static get properties() {
    return {
      currentSubIndex: { type: Number },
      index: { type: Number },
      selected: { type: Boolean },
      tracks: { type: Array },
    };
  }

  propagateTrackDrop(event) {
    this.dispatchCustomDropEvent(event.detail);
  }

  static get styles() {
    return css`
      .container {
        display: flex;
        flex-direction: row;
      }
      .gap-horizontal {
        cursor: grab;
        width: 30px;
      }
      .track {
        border-color: var(--foreground-color);
        border-style: solid;
        border-width: 1px;
        color: var(--foreground-color);
        font-family: "Supertext 02";
        font-size: 0.6em;
        padding: 10px;
        width: 300px;
        margin: 0px 10px 0px 10px;
      }
      .highlighted {
        background: var(--highlight-background-color);
      }
    `;
  }

  render() {
    return html`
      <div class="container ${this.highlighted ? 'highlighted' : ''}"
          draggable="true"
          @dragenter="${this.onDragEnter}"
          @dragleave="${this.onDragLeave}"
          @dragstart="${this.onDragStart}"
          @dragover="${this.onDragOver}"
          @drop="${this.onDrop}">
        <duaelmix-playlist-track
            .index="${this.index}"
            .subIndex="${0}"
            .track="${this.tracks[0]}"
            ?selected="${this.selected && this.currentSubIndex == 0}"
            @custom-drop="${this.propagateTrackDrop}">
        </duaelmix-playlist-track>
        <div class="gap-horizontal"></div>
        <duaelmix-playlist-track
            .index="${this.index}"
            .subIndex="${1}"
            .track="${this.tracks[1]}"
            ?selected="${this.selected && this.currentSubIndex == 1}"
            @custom-drop="${this.propagateTrackDrop}">
        </duaelmix-playlist-track>
      </div>`;
  }
}

customElements.define(
  'duaelmix-playlist-track-pair', DuaelmixPlaylistTrackPair);

class DuaelmixPlaylistGap extends DuaelmixDroppable {
  static get properties() {
    return {
      index: { type: Number },
    };
  }

  static get styles() {
    return css`
      .gap {
        height: 10px;
      }
      .highlighted {
        background: var(--highlight-background-color);
      }
    `;
  }

  render() {
    return html`
      <div class="gap ${this.highlighted ? 'highlighted': ''}"
          @dragenter="${this.onDragEnter}"
          @dragleave="${this.onDragLeave}"
          @dragover="${this.onDragOver}"
          @drop="${this.onDrop}">
      </div>`;
  }
}

customElements.define('duaelmix-playlist-gap', DuaelmixPlaylistGap);

const ButtonStyleMixin = (superclass) => class extends superclass {
  static get styles() {
    return [super.styles || [], css`
      .button-container {
        border-color: var(--foreground-color);
        border-style: solid;
        border-width: 2px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        height: 25px;
        padding: 10px;
        margin-right: 10px;
        user-select: none;
      }
      .button-content {
        color: white;
        font-family: "Supertext 02";
        font-size: 0.6em;
      }`
    ];
  }
};

class DuaelmixPlaylistTrash extends ButtonStyleMixin(DuaelmixDroppable) {
  static get styles() {
    return [
      super.styles, css`
      .highlighted {
        background: var(--highlight-background-color);
        color: var(--highlight-foreground-color);
      }`
    ];
  }

  render() {
    const highlightedClass = this.highlighted ? 'highlighted' : '';
    return html`
      <div class="button-container button-content ${highlightedClass}"
          @dragenter="${this.onDragEnter}"
          @dragleave="${this.onDragLeave}"
          @dragover="${this.onDragOver}"
          @drop="${this.onDrop}">
        Drag out the airlock
    </div>`;
  }
}

customElements.define('duaelmix-playlist-trash', DuaelmixPlaylistTrash);

class DuaelmixPlaylistFileSelector extends ButtonStyleMixin(LitElement) {
  async onFilesSelected(event) {
    const files = [];
    for (let i = 0; i < event.target.files.length; i++) {
      files.push(event.target.files.item(i));
    }
    this.dispatchEvent(new CustomEvent('files-selected', {
      detail: files,
    }));
    this.shadowRoot.getElementById('form').reset();
  }

  render() {
    return html`
      <form id="form">
        <div class="button-container">
          <input class="button-content"
              type="file"
              multiple
              @change="${this.onFilesSelected}">
          </input>
        </div>
      </form>
    `;
  }
}

customElements.define(
  'duaelmix-playlist-file-selector', DuaelmixPlaylistFileSelector);


class DuaelmixPlaylist extends LitElement {
  static get properties() {
    return {
      currentSubIndex: { type: Number, reflect: true },
      playlist: { type: Array },
      selectedIndex: { type: Number, reflect: true },
    };
  }

  constructor() {
    super();
    this.refreshPlaylistProperty();
    this.purgeMissingStoredTracksFromPlaylist();
  }

  async purgeMissingStoredTracksFromPlaylist() {
    const db = await storage.getDb();
    const keys = new Set(await storage.getAllKeys(db));
    this.updatePlaylist(playlist => {
      for (let i=playlist.length - 1; i >= 0; i--) {
        const tracks = playlist[i];
        for (let j=tracks.length - 1; j >= 0; j--) {
          const track = tracks[j];
          if (!keys.has(track[trackIndexedDbKey])) {
            tracks.splice(j, 1);
          }
        }
        if (tracks.length == 0) {
          playlist.splice(i, 1);
        }
      }
    });
  }

  dispatchCurrentItemChangedEvent(stopPlaying) {
    this.dispatchEvent(new CustomEvent(
      'current-item-changed', {
        detail: {
          item: this.playlist[this.selectedIndex],
          stopPlaying: stopPlaying
        }
      }
    ));
  }

  empty() {
    return this.playlist.length == 0;
  }

  updateSelectedIndex(delta) {
    if (this.empty()) return;
    let index = this.selectedIndex !== undefined ? this.selectedIndex : 0;
    index += delta;
    while (index < 0) {
      index += this.playlist.length;
    }
    while (index >= this.playlist.length) {
      index -= this.playlist.length;
    }
    this.selectedIndex = index;
    this.dispatchCurrentItemChangedEvent(false);
  }

  refreshPlaylistProperty() {
    this.playlist = config.getPlaylist();
  }

  updatePlaylist(updaterFunc) {
    const playlist = config.getPlaylist();
    updaterFunc(playlist);
    config.setPlaylist(playlist);
    this.refreshPlaylistProperty();
  }

  onDrop(event) {
    const {src, dst} = event.detail;
    if (!dst.canDrop(src, dst)) {
      return;
    }
    this.updatePlaylist(playlist => {
      if (src instanceof DuaelmixPlaylistTrack) {
        if (dst instanceof DuaelmixPlaylistTrack) {
          const srcTracks = playlist[src.index];
          const dstTracks = playlist[dst.index];
          if (dst.subIndex < dstTracks.length) {
            // Swap tracks.
            const dstTrackCopy = deepCopy(dstTracks[dst.subIndex]);
            dstTracks[dst.subIndex] = srcTracks[src.subIndex];
            srcTracks[src.subIndex] = dstTrackCopy;
          } else {
            // Move track to empty slot.
            dstTracks.push(srcTracks[src.subIndex]);
            srcTracks.splice(src.subIndex, 1);
            if (srcTracks.length == 0) {
              playlist.splice(src.index, 1);
            }
          }
        } else if (dst instanceof DuaelmixPlaylistGap) {
          // Move track to new track pair slot.
          let dstIndex = dst.index;
          const srcTracks = playlist[src.index];
          const [track] = srcTracks.splice(src.subIndex, 1);
          if (srcTracks.length == 0) {
            playlist.splice(src.index, 1);
            if (src.index < dstIndex) {
              dstIndex--;
            }
          }
          playlist.splice(dstIndex, 0, [track]);
        } else if (dst instanceof DuaelmixPlaylistTrash) {
          // Delete track.
          const srcTracks = playlist[src.index];
          const [track] = srcTracks.splice(src.subIndex, 1);
          if (srcTracks.length == 0) {
            playlist.splice(src.index, 1);
          }
          storage.getDb().then((db) => {
            storage.deleteFile(db, track[trackIndexedDbKey]);
          });
        }
      } else if (src instanceof DuaelmixPlaylistTrackPair) {
        if (dst instanceof DuaelmixPlaylistTrackPair) {
          // Swap track pairs.
          const dstTrackPairCopy = deepCopy(playlist[dst.index]);
          playlist[dst.index] = playlist[src.index];
          playlist[src.index] = dstTrackPairCopy;
        } else if (dst instanceof DuaelmixPlaylistGap) {
          // Move track pair to new index.
          let dstIndex = dst.index;
          const [trackPair] = playlist.splice(src.index, 1);
          if (src.index < dstIndex) {
            dstIndex--;
          }
          playlist.splice(dstIndex, 0, trackPair);
        } else if (dst instanceof DuaelmixPlaylistTrash) {
          // Delete track pair.
          const [trackPair] = playlist.splice(src.index, 1);
          storage.getDb().then((db) => {
            trackPair.forEach(
              track => storage.deleteFile(db, track[trackIndexedDbKey]));
          });
        }
      }
    });
    if (this.selectedIndex > this.playlist.length) {
      this.selectedIndex = this.playlist.length > 0
        ? this.playlist.length - 1
        : undefined;
    }
    this.dispatchCurrentItemChangedEvent(true);
  }

  async onFilesAdded(event) {
    const db = await storage.getDb();
    event.detail.forEach(async file => {
      const arrayBuffer = await storage.readFileContents(file);
      try {
        const arrayBufferClone = arrayBuffer.slice(0);
        await audio.decodeAudioData(arrayBufferClone);
      } catch (error) {
        // Is not audio.
        return;
      }
      try {
        // Can throw if a record by the same key is already present.
        await storage.storeFile(db, file.name, arrayBuffer);
      } finally {
        this.updatePlaylist(playlist => {
          playlist.push([{
            [trackName]: file.name, [trackIndexedDbKey]: file.name}]);
        });
      }
    });
  }

  buildSubIndexSelectedDispatcher(index) {
    return () => {
      this.dispatchEvent(
        new CustomEvent('sub-index-selected', {detail: index}));
    };
  }

  render() {
    const chromeColor = '#376160';
    return html`
      <style>
        :host {
          --background-color: #876e6b;
          --foreground-color: #fbf4e4;
          --highlight-foreground-color: black;
          --highlight-background-color: yellow;
          --frame-color: #e8f6e5;
        }

        .button-row {
          display: flex;
          flex-direction: row;
        }

        .frame {
          border: 2px solid var(--frame-color);
          opacity: 0.90;
          padding: 10px;
          background: #2e2f2a;
          width: 700px;
        }

        .hidden {
          display: none;
        }

        .tab {
          background: var(--frame-color);
          color: ${chromeColor};
          display: inline-block;
          font-family: "Supertext 02";
          font-size: 1em;
          font-weight: bold;
          padding: 0 10px 3px 10px;
          user-select: none;
        }

        /* Must be defined after lower-priorty classes. */
        .highlight {
          background: var(--highlight-background-color);
          color: var(--highlight-foreground-color);
        }
      </style>
      <div>
        <div class="tab">
          PLAYLIST
          <duaelmix-selector-button
              title="Left track"
              size="14"
              .color="${chromeColor}"
              @click="${this.buildSubIndexSelectedDispatcher(0)}">
          </duaelmix-selector-button>
          <duaelmix-selector-button
              title="Right track"
              size="14"
              flipped
              .color="${chromeColor}"
              @click="${this.buildSubIndexSelectedDispatcher(1)}">
          </duaelmix-selector-button>
        </div>
        <div class="frame">
          <div class="button-row">
            <duaelmix-playlist-file-selector
              @files-selected="${this.onFilesAdded}">
            </duaelmix-playlist-file-selector>
            <duaelmix-playlist-trash
                .hidden="${this.empty()}"
                @custom-drop="${this.onDrop}">
            </duaelmix-playlist-trash>
          </div>
          ${this.playlist.map((tracks, i) => html`
            <duaelmix-playlist-gap
                .index="${i}"
                @custom-drop="${this.onDrop}">
            </duaelmix-playlist-gap>
            <duaelmix-playlist-track-pair
                .currentSubIndex="${this.currentSubIndex}"
                .index="${i}"
                .tracks="${tracks}"
                .selected="${i == this.selectedIndex}"
                @custom-drop="${this.onDrop}"
            ></duaelmix-playlist-track-pair>`)}
            <duaelmix-playlist-gap
                .index="${this.playlist.length}"
                @custom-drop="${this.onDrop}">
            </duaelmix-playlist-gap>          
        </div>
      </div>
    `;
  }
}

customElements.define('duaelmix-playlist', DuaelmixPlaylist);

class DuaelmixCircularButton extends LitElement {
  static get properties() {
    return {
      active: { type: Boolean },
      size: { type: Number },
    };
  }

  static get styles() {
    return css`
      :host {
        display: inline-block;
      }
      svg * {
        cursor: pointer;
      }
    `;
  }

  static get icon() {
    throw 'Not implemented';
  }

  click() {
    this.dispatchEvent(new Event('custom-click'));
  }

  render() {
    const fill = (this.active) ? 'url(#grad)' : '#d3d3d3';
    return html`
      <svg height="${this.size}" width="${this.size}" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#41f234;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#8afa8a;stop-opacity:1" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="50" fill="${fill}"
            @click="${this.click}" />
        <svg x="20" y="20" width="60" height="60" @click="${this.click}">
          ${this.constructor.icon}
        </svg>
      </svg>`;
  }
}

class DuaelmixPlayButton extends DuaelmixCircularButton {
  static get icon() {
    return html`
      <svg viewBox="0 0 42.604 47.604">
        <path d="M43.331,21.237L7.233,0.397c-0.917-0.529-2.044-0.529-2.96,
          0c-0.916,0.528-1.48,1.505-1.48,2.563v41.684c0,1.058,0.564,2.035,1.48,
          2.563c0.458,0.268,0.969,0.397,1.48,0.397c0.511,0,1.022-0.133,
          1.48-0.397l36.098-20.84c0.918-0.529,1.479-1.506,1.479-2.564S44.247,
          21.767,43.331,21.237z"/>
      </svg>`;
  }
}

customElements.define('duaelmix-play-button', DuaelmixPlayButton);

class DuaelmixNextButton extends DuaelmixCircularButton {
  static get icon() {
    return html`
      <svg viewBox="0 0 66.307 66.307">
        <path d="M64.702,30.366L37.12,14.442c-0.995-0.574-2.221-0.574-3.217,
            0s-1.609,1.639-1.609,2.787v13.072L4.827,
            14.442c-0.997-0.574-2.222-0.574-3.218,0S0,16.081,0,17.229v31.849
            c0,1.148,0.613,2.211,1.609,2.785c0.498,0.287,1.053,0.432,1.608,0.432
            s1.111-0.145,1.609-0.432l27.466-15.857v13.072c0,1.148,0.612,2.211,
            1.608,2.785c0.498,0.287,1.055,0.432,1.609,0.432s1.111-0.145,
            1.607-0.432l27.582-15.924c0.996-0.574,1.609-1.637,
            1.609-2.787C66.311,32.004,65.698,30.94,64.702,30.366z"/>
      </svg>`;
  }
}

customElements.define('duaelmix-next-button', DuaelmixNextButton);

class DuaelmixPrevButton extends DuaelmixCircularButton {
  static get icon() {
    return html`
      <svg viewBox="0 0 66.31 66.31">
        <path d="M1.609,30.368L29.19,14.443c0.996-0.574,2.222-0.574,3.218,0
            s1.609,1.639,1.609,2.787v13.072l27.466-15.859c0.997-0.574,
            2.222-0.574,3.218,0s1.609,1.639,1.609,2.787v31.849c0,1.15-0.613,
            2.213-1.609,2.787c-0.498,0.287-1.053,0.432-1.607,
            0.432s-1.111-0.145-1.609-0.432L34.017,36.009v13.07c0,1.15-0.613,
            2.213-1.609,2.787c-0.498,0.287-1.054,0.432-1.609,
            0.432s-1.111-0.145-1.608-0.432L1.609,35.942C0.613,35.368,0,34.303,0,
            33.155S0.613,30.942,1.609,30.368z"/>
      </svg>`;
  }
}

customElements.define('duaelmix-prev-button', DuaelmixPrevButton);

class DuaelmixShuffleButton extends DuaelmixCircularButton {
  static get icon() {
    return html`
      <svg viewBox="0 0 375.633 375.633">
        <path d="M375.627,279.726l-78.877,67.608v-45.079h-13.277c-41.919,
            0-72.786-18.781-98.268-43.648c9.828-11.569,18.738-23.214,
            27.027-34.108c1.904-2.513,3.796-4.993,5.684-7.473c18.852,19.494,
            39.129,32.645,65.562,32.645h13.277v-37.568L375.627,279.726z M0,
            129.466h39.308c24.927,0,44.377,11.716,62.321,29.371c2.953-3.791,
            5.939-7.74,8.953-11.683c7.337-9.66,15.093-19.831,23.497-29.975
            c-24.813-23.187-54.75-40.309-94.77-40.309H0V129.466z M296.75,28.299
            v44.818h-13.277c-69.375,0-108.488,51.421-143.004,96.804c-31.046,
            40.749-57.85,75.989-101.161,75.989H0v52.59h39.308c69.386,0,
            108.498-51.394,143.015-96.766c31.035-40.798,57.844-76.033,
            101.15-76.033h13.277v37.84l78.883-67.629L296.75,28.299z" />
      </svg>`;
  }
}

customElements.define('duaelmix-shuffle-button', DuaelmixShuffleButton);

class DuaelmixRepeatButton extends DuaelmixCircularButton {
  static get icon() {
    return html`
      <svg viewBox="0 0 70 75">
        <path d="M33.511,71.013c15.487,0,28.551-10.563,32.375-24.859h9.113
            L61.055,22L47.111,46.151h8.006c-3.44,8.563-11.826,14.628-21.605,
            14.628c-12.837,0-23.28-10.443-23.28-23.28c0-12.836,10.443-23.28,
            23.28-23.28c6.604,0,12.566,2.768,16.809,7.196l5.258-9.108
            c-5.898-5.176-13.619-8.32-22.065-8.32C15.034,3.987,0,19.019,0,37.5
            C-0.002,55.981,15.03,71.013,33.511,71.013z"/>
      </svg>`;
  }
}

customElements.define('duaelmix-repeat-button', DuaelmixRepeatButton);


class DuaelmixIndicator extends LitElement {

  static get properties() {
    return {
      active: { type: Boolean },
      broken: { type: Boolean },
      height: { type: Number },
      width: { type: Number },
      progress: { type: Number },
    };
  }

  static get styles() {
    return css`
      :host {
        display: inline-block;
      }
    `;
  }

  render() {
    const w = this.width;
    const h = this.height;
    const p = this.progress ? this.progress : 0;
    const progressRect = html`
      <svg>
        <rect style="fill:yellow" width="${w * p}" height="${h}" />
      </svg>`;
    let svg;
    if (this.broken) {
      svg = html`
        <svg>
          <rect width="${w}" height="${h}"
              style="stroke:red;stroke-width:2;" />
          <line x1="0" y1="${h}" x2="${w}" y2="0"
              style="stroke:red;stroke-width:1" />
          ${progressRect}
        </svg>`;
    } else if (this.active) {
      svg = html`
        <svg>
          <rect width="${w}" height="${h}" style="fill:#62f662" />
          ${progressRect}
        </svg>`;
    } else {
      svg = html`
        <svg>
        <rect width="${w}" height="${h}"
            style="stroke:white;stroke-width:2;" />
        </svg>`;
    }
    return html`<svg width="${w}" height="${h}">${svg}</svg>`;
  }
}

customElements.define('duaelmix-indicator', DuaelmixIndicator);


class DuaelmixSelectorButton extends LitElement {
  static get properties() {
    return {
      color: { type: String },
      flipped: { type: Boolean },
      size: { type: Number },
    };
  }

  static get styles() {
    return css`
      :host {
        cursor: pointer;
        display: inline-block;
      }
    `;
  }

  render() {
    const pathSize = 459;
    return html`
      <svg
          height="${this.size}"
          width="${this.size}"
          viewBox="0 0 ${pathSize} ${pathSize}">
        <g transform="
            rotate(-90 ${pathSize / 2} ${pathSize / 2})
            ${this.flipped ? `scale(1 -1) translate(0 ${-pathSize})` : ''}">
          <path
              fill="${this.color}"
              d="M178.5,140.25v-102L0,216.75l178.5,178.5V290.7c127.5,0,216.75,
                  40.8,280.5,130.05C433.5,293.25,357,165.75,178.5,140.25z" />
        </g>
      </svg>`;
  }
}

customElements.define('duaelmix-selector-button', DuaelmixSelectorButton);

class DuaelmixDialog extends LitElement {
  show() {
    const dialog = this.shadowRoot.getElementById('dialog');
    dialogPolyfill.registerDialog(dialog);
    dialog.showModal();
  }

  close() {
    this.shadowRoot.getElementById('dialog').close();
  }

  static get styles() {
    return css`
      button {
        font-family: "Supertext 02";
        font-size: 0.8em;
        margin: 10px;
        padding: 5px 10px 5px 10px;
        background-color: #2e2f2a;
        border: 2px solid white;
        color: white;
        cursor: pointer;
        user-select: none;
      }

      dialog {
        background: #786261;
        color: white;
        font-family: "Supertext 02";
        font-size: 0.8em;
        max-width: 600px;
      }

      .button-row {
        margin-top: 10px;
        display: flex;
        flex-direction: row;
        justify-content: flex-end;
      }
    `;
  }

  render() {
    return html`
      <dialog id="dialog">
        <slot></slot>
        <div class="button-row">
          <button @click="${this.close}">CLOSE</button>
        </div>
      </dialog>
    `;
  }
}

customElements.define('duaelmix-dialog', DuaelmixDialog);

class DuaelmixApp extends LitElement {

  static get properties() {
    return {
      currentTrackLoadTime: { type: Number },
      playing: { type: Boolean },
      repeat: { type: Boolean },
      shuffle: { type: Boolean },
      progress: { type: Number },
    };
  }

  constructor() {
    super();
    api.listenToFirebase(this.subIndexChanged.bind(this));
    audio.eventTarget.addEventListener(
      'track-ended', this.onTrackEnded.bind(this));
    this.playing = false;
    setInterval(this.updateProgress.bind(this), 500);
  }

  getPlaylistElement() {
    return this.shadowRoot.getElementById('playlist');
  }

  updateProgress() {
    this.progress = audio.getTrackPosition() / audio.getTrackDuration();
  }

  async setPlaying(playDesired) {
    if (playDesired) {
      if (this.getPlaylistElement().empty()) return;
      audio.unpause();
      this.playing = true;
      if (audio.getTrackPosition() === undefined) {
        this.getPlaylistElement().updateSelectedIndex(0);
      }
    } else {
      audio.pause();
      this.playing = false;
    }
  }

  nextTrack() {
    audio.reset();
    this.getPlaylistElement().updateSelectedIndex(1);
  }

  previousTrack() {
    let delta = 0;
    const pos = audio.getTrackPosition();
    if (!this.playing
        || (pos !== undefined && pos < maxSecondsBeforePreviousMeansRestart)) {
      delta = -1;
    }
    audio.reset();
    this.getPlaylistElement().updateSelectedIndex(delta);
  }

  async loadTrackPair(trackPair) {
    const db = await storage.getDb();
    const audioBuffers = await Promise.all(trackPair.map(async track => {
      const arrayBuffer = await storage.retrieveFile(
        db, track[trackIndexedDbKey]);
      return await audio.decodeAudioData(arrayBuffer);
    }));
    audio.play(audioBuffers);
    this.updateProgress();
  }

  async onCurrentPlaylistItemChanged(event) {
    const {item, stopPlaying} = event.detail;
    if (this.playing && stopPlaying) {
      this.setPlaying(false);
      audio.reset();
    }
    if (item !== undefined && this.playing) {
      await this.loadTrackPair(item);
    }
  }

  onTrackEnded() {
    const delta = (this.repeat) ? 0 : 1;
    this.getPlaylistElement().updateSelectedIndex(delta);
  }

  subIndexChanged(subIndex) {
    audio.updateGainSelector(subIndex, 0.25);
    this.getPlaylistElement().currentSubIndex = subIndex;
  }

  onManualSubIndexSelection(event) {
    this.subIndexChanged(event.detail);
  }

  copyLink(event) {
    const selector = event.target.dataset.selector;
    const input = this.shadowRoot.querySelector(selector);
    input.select();
    document.execCommand('copy');
  }

  showLinkDialog() {
    this.shadowRoot.getElementById('link-dialog').show();
  }

  showHelpDialog() {
    this.shadowRoot.getElementById('help-dialog').show();
  }

  togglePlaying() {
    this.setPlaying(!this.playing);
  }

  toggleRepeat() {
    this.repeat = !this.repeat;
  }

  toggleShuffle() {
    this.shuffle = !this.shuffle;
  }

  render() {
    const buttonSize = 30;
    const indicatorWidth = 16;
    const indicatorHeight = 6;
    return html`
      <style>
        button {
          font-family: "Supertext 02";
          font-weight: bold;
          font-size: 0.8em;
          margin: 10px;
          padding: 5px 10px 5px 10px;
          border: 2px solid white;
          background-color: #2e2f2a;
          opacity: 0.90;
          color: white;
          cursor: pointer;
          user-select: none;
        }

        .api-link-container {
          margin: 10px;
        }

        .api-link-container input {
          width: 350px;
          font-family: "Courier New";
          font-size: 0.8em;
        }

        .api-link-container button {
          font-family: "Supertext 02";
          font-size: 0.8em;
          margin: 10px;
          padding: 5px 10px 5px 10px;
          background-color: #2e2f2a;
          border: 2px solid white;
          color: white;
          cursor: pointer;
        }

        .api-link-container div {
          width: 70px;
          display: inline-block;
        }

        .control-row {
          display: flex;
          flex-direction: row;
          align-self: center;
        }

        .control-container {
          align-self: flex-end;
          margin-right: 5px;
        }

        .hidden {
          display: none;
        }

        .stack {
          display: flex;
          flex-direction: column;
          text-align: center;
        }

        .title {
          font-family: Helvetica, sans-serif;
          font-size: 3em;
          font-weight: bold;
          text-shadow: 0 0 0.2em white;
          color: white;
          user-select: none;
        }

        .title-gap {
          width: 50px;
        }

        .title-row {
          display: flex;
          flex-direction: row;
          margin-bottom: 20px;
        }
      </style>
      <duaelmix-dialog id="link-dialog">
        <p>
          You can control the play mode through your own custom automation.
          Making requests to following URLs will change the music mode.
        </p>
        <div class="api-link-container">
          <div>Normal</div>
          <input id="link0"
              type="text"
              value="${api.getFirebaseApiUrl(0)}"
              readonly>
          </input>
          <button data-selector="#link0" @click="${this.copyLink}">COPY</button>
        </div>
        <div class="api-link-container">
        <div>Alternate</div>
          <input id="link1"
              type="text"
              value="${api.getFirebaseApiUrl(1)}"
              readonly>
          </input>
          <button data-selector="#link1" @click="${this.copyLink}">COPY</button>
        </div>
      </duaelmix-dialog>
      <duaelmix-dialog id="help-dialog">
        <p>
          Duaelmix is a music player that supports dual-mode tracks. The
          inspiration for this player was the
          <a target="_blank" href="https://benprunty.bandcamp.com/album/ftl"><b>sound track</b></a>
          to the game
          <a target="_blank" href="https://subsetgames.com/ftl.html"><b>FTL</b></a>.
        </p>
        <p>
          You can control the play mode through your own custom automation.
          Click LINK to see how this is done.
        </p>
        <p>
          First, load your music files (e.g. mp3/flac) and drag to arrange them
          in pairs. Regular tracks work too - the alternate mode is a filtered
          version.
        </p>
        <p>
          More info, source code and issue tracker at
          <a target="_blank" href="https://github.com/zmullett/duaelmix">github.com/zmullett/duaelmix</a>.
        </p>
      </duaelmix-dialog>
      <div class="title-row">
        <div class="title">
          DU&AElig;LMIX
        </div>
        <div class="title-gap"></div>
        <div class="control-row">
          <div class="control-container">
            <div class="stack">
              <duaelmix-indicator
                  .width="${indicatorWidth}"
                  .height="${indicatorHeight}"
                  ?active="${this.playing}"
                  .progress="${this.progress}">
              </duaelmix-indicator>
              <duaelmix-play-button
                  .size="${buttonSize}"
                  ?active="${this.playing}"
                  @custom-click="${this.togglePlaying}">
              </duaelmix-play-button>
            </div>
          </div>
          <div class="control-container">
            <duaelmix-prev-button
                .size="${buttonSize}"
                ?active="${true}"
                @custom-click="${this.previousTrack}">
            </duaelmix-prev-button>
          </div>
          <div class="control-container">
            <duaelmix-next-button
                .size="${buttonSize}"
                ?active="${true}"
                @custom-click="${this.nextTrack}">
            </duaelmix-next-button>
          </div>
          <div class="control-container hidden">
            <div class="stack">
              <duaelmix-indicator
                  .width="${indicatorWidth}"
                  .height="${indicatorHeight}"
                  ?active="${this.shuffle}">
              </duaelmix-indicator>
              <duaelmix-shuffle-button
                  .size="${buttonSize}"
                  ?active="${this.shuffle}"
                  @custom-click="${this.toggleShuffle}">
              </duaelmix-shuffle-button>
            </div>
          </div>
          <div class="control-container">
            <div class="stack">
              <duaelmix-indicator
                  .width="${indicatorWidth}"
                  .height="${indicatorHeight}"
                  ?active="${this.repeat}">
              </duaelmix-indicator>
              <duaelmix-repeat-button
                  .size="${buttonSize}"
                  ?active="${this.repeat}"
                  @custom-click="${this.toggleRepeat}">
              </duaelmix-repeat-button>
            </div>
          </div>
        </div>
        <div class="title-gap"></div>
        <div class="control-row">
          <button class="hidden">SETTINGS</button>
          <button @click="${this.showLinkDialog}">LINK</button>
          <button @click="${this.showHelpDialog}">HELP</button>
        </div>
      </div>
      <div>        
        <duaelmix-playlist id="playlist"
            .currentSubIndex="${0}"
            @current-item-changed="${this.onCurrentPlaylistItemChanged}"
            @sub-index-selected="${this.onManualSubIndexSelection}">
        </duaelmix-playlist>
      </div>`;
  }
}

customElements.define('duaelmix-app', DuaelmixApp);
