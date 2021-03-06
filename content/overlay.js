var Readeroo = {};

Readeroo.I18N = {

  strings: null,

  onLoad: function() {
    this.strings = document.getElementById('readeroo-strings');
  },

  getString: function(key) {
    return this.strings.getString(key);
  }
}

Readeroo.Preferences = {
  tagtoread: '',
  tagdonereading: '',
  shareditem: true,
  deleteitem: false,
  sortitems: '',
  prefs: null,
  processing: false,
  lastLoadDate: '',

  load: function() {
    const prefService = Components.classes['@mozilla.org/preferences-service;1']
        .getService(Components.interfaces.nsIPrefService);
    this.prefs = prefService.getBranch('extensions.readeroo.');
    if (this.prefs.getCharPref('tagtoread') == '') {
      this.prefs.setCharPref('tagtoread', 'toread');
    }
    this.tagtoread = this.prefs.getCharPref('tagtoread');
    this.tagdonereading = this.prefs.getCharPref('tagdonereading');
    this.deleteitem = this.prefs.getBoolPref('deleteitem');
    this.shareditem = this.prefs.getBoolPref('shareditem');
    if (this.prefs.getCharPref('sortitems') == '') {
      this.prefs.setCharPref('sortitems', 'filo');
    }
    this.sortitems = this.prefs.getCharPref('sortitems');
  },
  
  isProcessing: function() {
    return this.processing;
  },
  
  startProcessing: function() {
    this.processing = true;
  },
  
  stopProcessing: function() {
    this.processing = false;
  },

  refresh: function() {
    var span = 1800000;
    var d = new Date();
    var now = d.getTime();
    if (this.lastLoadDate == '') {
      this.lastLoadDate = d.getTime() + span + 10000;
    }
    if (now - this.lastLoadDate > span) {
      this.lastLoadDate = d.getTime();
      return true;
    } 
    return false;
  }
};

Readeroo.Controller = {

  onAddClickCommand: function(e){
    if (Readeroo.Preferences.isProcessing()) {
      return;
    }
    Readeroo.AddButton.setProcessing();
    Readeroo.Preferences.load();
    DocumentHelper.initialize();
    
    // initialize the item to add
    var urlItem = new DeliciousItem();
    urlItem.url = DocumentHelper.getUrl();
    urlItem.description = DocumentHelper.getTitle();
    if (urlItem.url == '') {
      Readeroo.AddButton.setError(Readeroo.I18N.getString('error01'));
      return;
    }
    urlItem.tags.push(Readeroo.Preferences.tagtoread);

    Readeroo.DeliciousQueue.add(urlItem,
        function(msg){
          Readeroo.AddButton.setNormal(msg);
        },
        function(msg) {
          Readeroo.AddButton.setError(msg);
        });
  },
  
  onReadClickCommand: function(e){
    if (Readeroo.Preferences.isProcessing()) {
      return;
    }
    Readeroo.ReadButton.setProcessing();
    Readeroo.Preferences.load();
    Readeroo.DeliciousQueue.read(
        function(msg){
          Readeroo.ReadButton.setNormal(msg);
        },
        function(msg) {
          Readeroo.ReadButton.setError(msg);
        });
  }
};

function ReaderooButton(id, text) {
  this.controlId = 'readeroo-button-' + id;
  this.tooltipId = id + 'tip';
  this.normalImage = 'chrome://readeroo/skin/' + id + '_normal.png';
  this.processingImage = 'chrome://readeroo/skin/processing.png';
  this.errorImage = 'chrome://readeroo/skin/error.png';
  this.text = text;
};

ReaderooButton.prototype.set_ = function(image, tooltip) {
  document.getElementById(this.controlId).image = image;
  document.getElementById(this.tooltipId).label = tooltip;
};

ReaderooButton.prototype.setNormal = function(tooltip) {
  Readeroo.Preferences.stopProcessing();
  if (!tooltip) {
    tooltip = this.text;
  }
  this.set_(this.normalImage, tooltip);
}

ReaderooButton.prototype.setProcessing = function(tooltip) {
  Readeroo.Preferences.startProcessing();
  if (!tooltip) {
    tooltip = Readeroo.I18N.getString('processing');
  }
  this.set_(this.processingImage, tooltip);
};

ReaderooButton.prototype.setError = function(tooltip) {
  Readeroo.Preferences.stopProcessing();
  tooltip = Readeroo.I18N.getString('error') + ' ' + tooltip;
  this.set_(this.errorImage, tooltip);
}

Readeroo.DeliciousQueue = {

  urlCache: [],
  currentItem: null,

  add: function(urlItem, callback, errorCallback) {

    // first check to see if the url already exists
    // in delicious
    DeliciousApi.get({url: urlItem.url},

    // callback function for the Delicious API "get" call
    // if the bookmark already exists, copying the old 
    // values over to the new item before saving it to 
    // delicious.
    function(items) { 

      // if the url already exists
      if (items.length > 0) {

        var oldItem = items[0];

        // copy all the old values over
        urlItem.description = oldItem.description;
        urlItem.notes = oldItem.notes;

        // copy all the tags over (except for the "toread" 
        // and "donereading" tags)
        for (var i = 0; i < oldItem.tags.length; i++) {
          var currTag = oldItem.tags[i];
          if ((currTag != Readeroo.Preferences.tagtoread) &&
              (currTag != Readeroo.Preferences.tagdonereading))
            urlItem.tags.push(oldItem.tags[i]);
          }
        }

        // call the actual add function
        DeliciousApi.add(urlItem, Readeroo.Preferences.shareditem, 
            // callback from "add" api call.
            // if add is successful, revert icon back to normal
            // otherwise show error icon
            // we are so far deep inside the rabbit hole right now!
            function(success) {
              if (success) {
                // do stuff for success
                callback();
              } else {
                // failure
                errorCallback();
              }
            },
            function(http) {
              errorCallback(http.status + ' ' + http.statusText);
            }
        );
      }
    );
  },
  
  read: function(callback, errorCallback) {
    // if the cache is empty, or its time to refresh the cache        
    if ((Readeroo.DeliciousQueue.urlCache.length == 0) || 
        (Readeroo.Preferences.refresh())) {
     DeliciousApi.all({tag : Readeroo.Preferences.tagtoread, count : 100}, 
        function(items) {
          // TODO: Refactor this out
          if (Readeroo.Preferences.sortitems == 'fifo') {
            items.sort( function(a, b) {
                if (a.time < b.time) return -1;
                if (a.time > b.time) return 1;
                return 0;
              }
            );
          }
          if (Readeroo.Preferences.sortitems == 'random') {
            for (var i = 0; i < items.length; i++) {
              var r = Math.round(items.length*Math.random());
              var tmp = items[r];
              items[r] = items[i];
              items[i] = tmp;
            }
          }
          Readeroo.DeliciousQueue.urlCache = items;
          Readeroo.DeliciousQueue.readCallback(callback, errorCallback);
        }, errorCallback
      );
    } else {
      Readeroo.DeliciousQueue.readCallback(callback, errorCallback);
    }
  },
  
  readCallback: function(callback, errorCallback) {
    if (Readeroo.DeliciousQueue.urlCache.length == 0) {
      errorCallback(Readeroo.I18N.getString('noitemsleft'));
      return;
    }
    Readeroo.DeliciousQueue.currentItem =
        Readeroo.DeliciousQueue.urlCache.shift();

    if (Readeroo.Preferences.deleteitem) {
      DeliciousApi.deleteItem(Readeroo.DeliciousQueue.currentItem.url,
          function(responseText) {
            Readeroo.DeliciousQueue.markReadCallback(responseText, callback, 
                errorCallback)
          }, errorCallback
      );
    } else {
      for (var i = 0; i < Readeroo.DeliciousQueue.currentItem.tags.length; 
          i++) {
        if (Readeroo.DeliciousQueue.currentItem.tags[i] ==
            Readeroo.Preferences.tagtoread) {
          Readeroo.DeliciousQueue.currentItem.tags[i] = 
              Readeroo.Preferences.tagdonereading;
        }
      }

      DeliciousApi.add(Readeroo.DeliciousQueue.currentItem, 
          Readeroo.Preferences.shareditem, 
          function(responseText) {
            Readeroo.DeliciousQueue.markReadCallback(responseText, callback, 
                errorCallback)
          }, errorCallback
      );
    }
  },
  
  markReadCallback: function(responseText, callback, errorCallback) {
    window._content.document.location = Readeroo.DeliciousQueue.currentItem.url;
    var tooltip = '';
    var length = Readeroo.DeliciousQueue.urlCache.length;
    if (length == 0) {
      tooltip = Readeroo.I18N.getString('noitemsleft');
    } else {
      tooltip = length + ' ' + Readeroo.I18N.getString('itemsleft');
    }
    callback(tooltip);
  }
};

Readeroo.FirstRun = {

  onLoad: function() {
    var prefs = Components.classes['@mozilla.org/preferences-service;1']
        .getService(Components.interfaces.nsIPrefService)
        .getBranch('extensions.readeroo.');
    try {
      if (prefs.getBoolPref('firstRun')) {
        setTimeout(Readeroo.Controller.addToolbarButton, 0);
        prefs.setBoolPref('firstRun', false);
      }
    } catch (e) {
      prefs.setBoolPref('firstRun', true);
    }
  },

  addToolbarButton: function() {

    function getIndex(arr, val){
      for (var i = 0; i < arr.length; i++) {
        if (arr[i] == val){
          return i;
        }
      }
      return -1;
    }

    if (!document.getElementById('readeroo-button-add')){
      // Determine which toolbar to place the icon onto
      if (document.getElementById('nav-bar')
          .getAttribute('collapsed') != 'true'){
        var toolbar = document.getElementById('nav-bar');
      }
      else {
        var toolbar = document.getElementById('toolbar-menubar');
      }

      var toolbox = document.getElementById('navigator-toolbox');
      var toolboxDocument = toolbox.ownerDocument;
    
      var currentSet = toolbar.currentSet;
      var newSet = currentSet;
      var setItems = currentSet.split(',');
      
      // Order of adding:
      //   before urlbar-container
      //   after home-button
      //   after reload-button
      //   after stop-button
      //   after forward-button
      //   before search-container
      //   at the end

      if (getIndex(setItems, 'urlbar-container') != -1){
        newSet = currentSet.replace('urlbar-container','readeroo-button-add,' +
            'readeroo-button-read,urlbar-container');
      }
      else if (getIndex(setItems, 'home-button') != -1){
        newSet = currentSet.replace('home-button','home-button,' + 
            'readeroo-button-add,readeroo-button-read');
      }
      else if (getIndex(setItems, 'reload-button') != -1){
        newSet = currentSet.replace('reload-button','reload-button,' +
            'readeroo-button-add,readeroo-button-read');
      }
      else if (getIndex(setItems, 'stop-button') != -1){
        newSet = currentSet.replace('stop-button','stop-button,' + 
            'readeroo-button-add,readeroo-button-read');
      }
      else if (getIndex(setItems, 'forward-button') != -1){
        newSet = currentSet.replace('forward-button','forward-button,' + 
            'readeroo-button-add,readeroo-button-read');
      }
      else if (getIndex(setItems, 'search-container') != -1){
        newSet = currentSet.replace('search-container','readeroo-button-add,' +
            'readeroo-button-read,search-container');
      }
      else {
        newSet += ',readeroo-button-add,readeroo-button-read';
      }
      
      toolbar.currentSet = newSet;
      toolbar.setAttribute('currentset', newSet);
      
      toolboxDocument.persist(toolbar.id, 'currentset');
      
      try {
        BrowserToolboxCustomizeDone(true)
      } catch (e) { }
    }
  }
};

Readeroo.onLoad = function() {
  Readeroo.I18N.onLoad();
  Readeroo.AddButton = new ReaderooButton('add', 
      Readeroo.I18N.getString('add'));
  Readeroo.ReadButton = new ReaderooButton('read', 
      Readeroo.I18N.getString('readtooltip'));
  Readeroo.FirstRun.onLoad();
}

window.addEventListener('load', Readeroo.onLoad, false);
