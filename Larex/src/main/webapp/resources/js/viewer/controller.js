function Controller(bookID, canvasID, specifiedColors, colors, globalSettings) {
	var _bookID = bookID;
	var _actionController = new ActionController(this);
	var _communicator = new Communicator();
	var _globalSettings = globalSettings;
	var _gui;
	var _guiInput;
	var _editor;
	var _currentPage;
	var _segmentedPages = [];
	var _savedPages = [];
	var _book;
	var _segmentation;
	var _settings;
	var _activesettings;
	var _segmentationtypes;
	var _presentRegions = [];
	var _exportSettings = {};
	var _currentPageDownloadable = false;
	var	_currentSettingsDownloadable = false;
	var _pageXMLVersion = "2010-03-19";
	var _gridIsActive = false;
	var _displayReadingOrder = false;
	var _tempReadingOrder = null;
	var _allowLoadLocal = false;
	var _thisController = this;
	var _selected = [];
	this.selectmultiple = false;
	var _isSelecting = false;
	var _selectType;
	var _visibleRegions = {}; // !_visibleRegions.contains(x) and _visibleRegions[x] == false => x is hidden

	var _editReadingOrder = false;

	var _newPathCounter = 0;
	var _specifiedColors = specifiedColors;
	var _colors = colors;

	// main method
	$(window).ready(function() {
				// Init PaperJS
				paper.setup(document.getElementById(canvasID));

				//set height before data is loaded //TODO rework
				$canvas = $("canvas");
				$sidebars = $('.sidebar');
				var height = $(window).height() - $canvas.offset().top;
				$canvas.height(height);
				$sidebars.height(height);

				_currentPage = 0;
				_thisController.showPreloader(true);
				_communicator.loadBook(_bookID,_currentPage).done(function(data) {
							_book = data.book;
							_segmentation = data.segmentation;
							_segmentationtypes = data.segmenttypes;
							_settings = data.settings;
							// clone _settings
							_activesettings = JSON.parse(JSON.stringify(_settings));
							_segmentedPages.push(_currentPage);

							// Init the viewer
							var navigationController = new NavigationController();
							var viewerInput = new ViewerInput(_thisController);

							// Inheritance Editor extends Viewer
							_editor = new Editor(new Viewer(
									_segmentationtypes, viewerInput,colors,specifiedColors),
									_thisController);

							_gui = new GUI(canvasID, _editor);
							_gui.setCanvasUITopRight();
							_gui.resizeViewerHeight();

							_gui.setParameters(_settings.parameters,_settings.imageSegType,_settings.combine);
							_gui.setRegionLegendColors(_segmentationtypes);
							_gui.highlightSegmentedPages(_segmentedPages);

							_gui.setPageXMLVersion(_pageXMLVersion);

							_gui.setAllRegionColors(colors);
							_gui.updateAvailableColors(_thisController.getAvailableColorIndexes());

							navigationController.setGUI(_gui);
							navigationController.setViewer(_editor);
							// setup paper again because of pre-resize bug
							// (streched)
							paper.setup(document.getElementById(canvasID));


							// Init inputs
							var keyInput = new KeyInput(navigationController,
									_thisController, _gui);
							$("#"+canvasID).mouseover(function(){keyInput.isActive = true;});
							$("#"+canvasID).mouseleave(function(){keyInput.isActive = false;});
							_guiInput = new GuiInput(navigationController, _thisController, _gui);

							_thisController.showPreloader(false);
							_thisController.displayPage(0);

							// on resize
							$(window).resize(function() {
								_gui.setCanvasUITopRight();
								_gui.resizeViewerHeight();
							});
						});

			});

	this.displayPage = function(pageNr) {
		_currentPage = pageNr;

		_thisController.showPreloader(true);

		if (_segmentedPages.indexOf(_currentPage) < 0 && _savedPages.indexOf(_currentPage) < 0) {
				requestSegmentation([_currentPage],_allowLoadLocal);
		}else{
				var imageId = _book.pages[_currentPage].id+"image";
				// Check if image is loaded
				var image = $('#'+imageId);
				if(!image[0]){
					_communicator.loadImage(_book.pages[_currentPage].image,imageId).done(function(){
						_thisController.displayPage(pageNr);
					});
					return false;
				}
				if(!image[0].complete){
					// break untill image is loaded
					image.load(function() {
						_thisController.displayPage(pageNr);
					});
					return false;
				}

				_editor.clear();
				_editor.setImage(imageId);
				var pageSegments = _segmentation.pages[_currentPage].segments;
				var pageFixedSegments = _settings.pages[_currentPage].segments;

				var readingOrderIsEmpty = false;
				if(!_exportSettings[_currentPage]){
					initExportSettings(_currentPage);
				}

				// Iterate over Segment-"Map" (Object in JS)
				Object.keys(pageSegments).forEach(function(key) {
					var hasFixedSegmentCounterpart = false;
					if(!pageFixedSegments[key] && !(_exportSettings[_currentPage] && $.inArray(key,_exportSettings[_currentPage].segmentsToIgnore) >= 0)){
						//has no fixedSegment counterpart and has not been deleted
						_editor.addSegment(pageSegments[key]);
					}
				});
				// Iterate over FixedSegment-"Map" (Object in JS)
				Object.keys(pageFixedSegments).forEach(function(key) {
					_editor.addSegment(pageFixedSegments[key],true);
				});

				var regions = _settings.regions;
				// Iterate over Regions-"Map" (Object in JS)
				Object.keys(regions).forEach(function(key) {
					var region = regions[key];

					// Iterate over all Polygons in Region
					Object.keys(region.polygons).forEach(function(polygonKey) {
						var polygon = region.polygons[polygonKey];

						_editor.addRegion(polygon);

						if(!_visibleRegions[region.type] & region.type !== 'ignore'){
							_editor.hideSegment(polygon.id,true);
						}
					});

					if(region.type !== 'ignore' && $.inArray(region.type, _presentRegions) < 0){
						//_presentRegions does not contains region.type
						_presentRegions.push(region.type);
					}
				});

				var pageCuts = _settings.pages[_currentPage].cuts;
				// Iterate over FixedSegment-"Map" (Object in JS)
				Object.keys(pageCuts).forEach(function(key) {
					_editor.addLine(pageCuts[key]);
				});
				_editor.center();
				_editor.zoomFit();

				_gui.updateZoom();true
				_gui.showUsedRegionLegends(_presentRegions);
				_gui.setReadingOrder(_exportSettings[_currentPage].readingOrder);
				_guiInput.addDynamicListeners();
				_thisController.displayReadingOrder(_displayReadingOrder);
				_gui.setRegionLegendColors(_segmentationtypes);

				_thisController.setPageDownloadable(_currentPage,false);
				_gui.selectPage(pageNr);
				_tempReadingOrder = null;
				_thisController.endCreateReadingOrder();
				_thisController.showPreloader(false);
		}
	}

	this.redo = function() {
		_actionController.redo(_currentPage);
	}
	this.undo = function() {
		_actionController.undo(_currentPage);
	}

	this.addPresentRegions = function(regionType){
		if(region.type !== 'ignore' && $.inArray(regionType, _presentRegions) < 0){
			//_presentRegions does not contains region.type
			_presentRegions.push(regionType);
		}
		_gui.showUsedRegionLegends(_presentRegions);
	}
	this.removePresentRegions = function(regionType){
		_presentRegions = jQuery.grep(_presentRegions, function(value) {
  		return value != regionType;
		});
		_gui.showUsedRegionLegends(_presentRegions);
	}

	// New Segmentation with different Settings
	this.doSegmentation = function(pages){
		var parameters = _gui.getParameters();
		_settings.parameters = parameters;

		// clone _settings
		_activesettings = JSON.parse(JSON.stringify(_settings));
		_segmentedPages = _savedPages.slice(0); //clone saved Pages

		requestSegmentation(pages,false);
	}

	this.loadExistingSegmentation = function(){
		var parameters = _gui.getParameters();
		_settings.parameters = parameters;

		// clone _settings
		_activesettings = JSON.parse(JSON.stringify(_settings));
		_segmentedPages = _savedPages.slice(0); //clone saved Pages

		requestSegmentation(null,true);
	}
	
	this.uploadExistingSegmentation = function(file){
		_segmentedPages = _savedPages.slice(0); //clone saved Pages
		uploadSegmentation(file,_currentPage);
	}

	var requestSegmentation = function(pages, allowLoadLocal){
		if(!pages){
				pages = [_currentPage];
		}

		_communicator.segmentBook(_activesettings,pages,allowLoadLocal).done(function(data){
				var failedSegmentations = [];
				var missingRegions = [];
				pages.forEach(function(pageID) {
					var page = data.result.pages[pageID];
					// reset export Settings
					initExportSettings(pageID);
					switch (page.status) {
						case 'SUCCESS':
							_segmentation.pages[pageID] = page;

							_actionController.resetActions(pageID);
							//check if all necessary regions are available
							Object.keys(page.segments).forEach(function(segmentID) {
								var segment = page.segments[segmentID];
								if($.inArray(segment.type,_presentRegions) == -1){
									//TODO as Action
									_thisController.changeRegionSettings(segment.type,0,0);	
									missingRegions.push(segment.type);
								}
							});
							var readingOrder = [];
							page.readingOrder.forEach(function(segmentID) {
								readingOrder.push(page.segments[segmentID]);
							});
							_actionController.addAndExecuteAction(new ActionChangeReadingOrder(_exportSettings[pageID].readingOrder,readingOrder,_thisController,_exportSettings,pageID),pageID);
							break;
						default:
							failedSegmentations.push(pageID);
						}
					
				});
				_segmentedPages.push.apply(_segmentedPages,pages);
				if(missingRegions.length > 0){
					_gui.displayWarning('Warning: Some regions were missing and have been added.');
				}

				_thisController.displayPage(pages[0]);
				_gui.highlightSegmentedPages(_segmentedPages);
				_gui.highlightPagesAsError(failedSegmentations);
		});
	}

	var uploadSegmentation = function(file,pageNr){
		_thisController.showPreloader(true);
		if(!pageNr){
			pageNr = _currentPage;
		}
		_communicator.uploadPageXML(file,pageNr).done(function(data){
				var failedSegmentations = [];
				var missingRegions = [];
				var page = data.result.pages[pageNr];
				// reset export Settings
				initExportSettings(pageNr);
				
				switch (page.status) {
					case 'SUCCESS':
						_segmentation.pages[pageNr] = page;
						
						_actionController.resetActions(pageNr);

						//check if all necessary regions are available
						Object.keys(page.segments).forEach(function(segmentID) {
							var segment = page.segments[segmentID];
							if($.inArray(segment.type,_presentRegions) == -1){
								//TODO as Action
								_thisController.changeRegionSettings(segment.type,0,0);	
								missingRegions.push(segment.type);
							}
						});
						var readingOrder = [];

						page.readingOrder.forEach(function(segmentID) {
							readingOrder.push(page.segments[segmentID]);
						});
						_actionController.addAndExecuteAction(
							new ActionChangeReadingOrder(_exportSettings[pageNr].readingOrder,readingOrder,_thisController,_exportSettings,pageNr)
							,pageNr);
						break;
					default:
						failedSegmentations.push(pageNr);
					}
					
				_segmentedPages.push(pageNr);
				if(missingRegions.length > 0){
					_gui.displayWarning('Warning: Some regions were missing and have been added.');
				}

				_thisController.displayPage(pageNr);
				_thisController.showPreloader(false);
				_gui.highlightSegmentedPages(_segmentedPages);
				_gui.highlightPagesAsError(failedSegmentations);
		});
	}
	this.setPageXMLVersion = function(pageXMLVersion){
		_pageXMLVersion = pageXMLVersion;
	}

	this.downloadPageXML = function(){
		if(_globalSettings.downloadPage){
			if(_currentPageDownloadable){
				var popup_download = window.open("exportXML?version="+_pageXMLVersion);
			}
			try {
				popup_download.focus();
			} catch(e){
				_gui.displayWarning("Download was blocked. Please disable the Pop-up Blocker for this website.");
				_gui.highlightExportedPage(_currentPage);
			}
		}else{
			$.get("exportXML?version="+_pageXMLVersion);
			_gui.highlightExportedPage(_currentPage);
		}
	}

	this.exportPageXML = function(){
		if(!_exportSettings[_currentPage]){
			initExportSettings(_currentPage);
		}
		_gui.setExportingInProgress(true);
		if(_settings.pages[_currentPage]){
			_exportSettings[_currentPage].fixedRegions = _settings.pages[_currentPage].segments;
		}

		_communicator.prepareExport(_currentPage,_exportSettings[_currentPage]).done(function() {
			_thisController.setPageDownloadable(_currentPage,true);
			_gui.setExportingInProgress(false);
			_gui.highlightSavedPage(_currentPage);
			_savedPages.push(_currentPage);
			_thisController.downloadPageXML();
		});
	}

	this.downloadSettingsXML = function(){
		if(_currentSettingsDownloadable){
			var popup_download = window.open("downloadSettings");
			try {
				popup_download.focus();
			} catch(e){
				_gui.displayWarning("Download was blocked. Please disable the Pop-up Blocker for this website.");
			}
		}
	}

	this.saveSettingsXML = function(){
		_gui.setSaveSettingsInProgress(true);
		_settings.parameters = _gui.getParameters();
		_communicator.prepareSettingsExport(_settings).done(function() {
			_currentSettingsDownloadable = true;
			_gui.setSettingsDownloadable(_currentSettingsDownloadable);
			_gui.setSaveSettingsInProgress(false);
			_thisController.downloadSettingsXML();
		});
	}

	this.uploadSettings = function(file){
		_communicator.uploadSettings(file).done(function(settings){
			if(settings){
				_settings = settings;
				_presentRegions = [];
				Object.keys(_settings.regions).forEach(function(regionType) {
					if(regionType !== 'ignore'){
						_presentRegions.push(regionType);
					}
				});
				_gui.showUsedRegionLegends(_presentRegions);
				_gui.setParameters(_settings.parameters,_settings.imageSegType,_settings.combine);

				_thisController.displayPage(_currentPage);
				_thisController.hideAllRegions(true);
				_gui.forceUpdateRegionHide(_visibleRegions);
				_actionController.resetActions(_currentPage);
			}
		});
	}

	this.createPolygon = function(doSegment) {
		_thisController.endEditing(true);
		var type = doSegment ? 'segment' : 'region';
		_editor.startCreatePolygon(type);
		if(doSegment){
			_gui.selectToolBarButton('segmentPolygon',true);
		}
	}
	this.createRectangle = function(type) {
		_thisController.endEditing(true);

		_editor.startCreateRectangle(type);
		switch(type){
			case 'segment':
				_gui.selectToolBarButton('segmentRectangle',true);
				break;
			case 'region':
				_gui.selectToolBarButton('regionRectangle',true);
				break;
			case 'ignore':
				_gui.selectToolBarButton('ignore',true);
				break;
			case 'roi':
				_gui.selectToolBarButton('roi',true);
				break;
		}
	}
	this.createCut = function() {
		_thisController.endEditing(true);
		_editor.startCreateLine();
		_gui.selectToolBarButton('cut',true);
	}
	this.moveSelected = function() {
		if(_selected.length > 0){
			//moveLast instead of all maybe TODO
			var moveID = _selected[_selected.length-1];
			if (_selectType === "region") {
				_editor.startMovePath(moveID,'region');
			} else if(_selectType === "segment"){
				_editor.startMovePath(moveID,'segment');
			}else if(_selectType === "line"){
				//TODO
			}
			this.unSelect();
		}
	}

	this.scaleSelected = function() {
		if(_selected.length > 0){
			//moveLast instead of all maybe TODO
			var moveID = _selected[_selected.length-1];
			if (_selectType === "region") {
				_editor.startScalePath(moveID,'region');
			} else if(_selectType === "segment"){
				_editor.startScalePath(moveID,'segment');
			}else if(_selectType === "line"){
				//TODO
			}
			this.unSelect();
		}
	}
	this.endEditing = function(doAbbord){
		_editor.endEditing(doAbbord);
		_gui.unselectAllToolBarButtons();
	}
	this.deleteSelected = function() {
		var actions = [];
		for (var i = 0, selectedlength = _selected.length; i < selectedlength; i++) {
			if (_selectType === "region") {
				var regionPolygon = getRegionByID(_selected[i]);
				actions.push(new ActionRemoveRegion(regionPolygon, _editor, _settings, _currentPage,_thisController));
			} else if(_selectType === "segment"){
				if(!_exportSettings[_currentPage]){
					initExportSettings(_currentPage);
				}
				var segment = _settings.pages[_currentPage].segments[_selected[i]];
				//Check if result segment or fixed segment (null -> result region)
				if(!segment){
					segment = _segmentation.pages[_currentPage].segments[_selected[i]];
					actions.push(new ActionRemoveSegment(segment,_editor,_segmentation,_currentPage,_exportSettings,_thisController));
				}else{
					actions.push(new ActionRemoveSegment(segment,_editor,_settings,_currentPage,_exportSettings,_thisController));
				}
			}else if(_selectType === "line"){
				var cut = _settings.pages[_currentPage].cuts[_selected[i]];
				actions.push(new ActionRemoveCut(cut,_editor,_settings,_currentPage));
			}
		}
		this.unSelect();
		var multidelete = new ActionMultiple(actions);
		_actionController.addAndExecuteAction(multidelete,_currentPage);
	}
	this.mergeSelectedSegments = function() {
		var actions = [];
		var segmentIDs = [];
		for (var i = 0, selectedlength = _selected.length; i < selectedlength; i++) {
			if(_selectType === "segment"){
				var segment = _settings.pages[_currentPage].segments[_selected[i]];
				//Check if result segment or fixed segment (null -> fixed segment)
				if(!segment){
					segment = _segmentation.pages[_currentPage].segments[_selected[i]];
					//filter special case image (do not merge images)
					if(segment.type !== 'image'){
						if(!_exportSettings[_currentPage]){
							initExportSettings(_currentPage);
						}
						segmentIDs.push(segment.id);
						actions.push(new ActionRemoveSegment(segment,_editor,_segmentation,_currentPage,_exportSettings,_thisController));
					}
				}else{
					/*//Fixed Segments can't be merged atm
					segment = _settings.pages[_currentPage].segments[_selected[i]];
					segmentIDs.push(segment.id);
					actions.push(new ActionRemoveSegment(segment,_editor,_settings,_currentPage));*/
				}
			}
		}
		if(segmentIDs.length > 1){
			_communicator.requestMergedSegment(segmentIDs,_currentPage).done(function(data){
				var mergedSegment = data;
				actions.push(new ActionAddFixedSegment(mergedSegment.id, mergedSegment.points, mergedSegment.type,
						_editor, _settings, _currentPage, _exportSettings,_thisController));

				_thisController.unSelect();

				var mergeAction = new ActionMultiple(actions);
				_actionController.addAndExecuteAction(mergeAction,_currentPage);
				_thisController.selectSegment(mergedSegment.id);
				_thisController.openContextMenu(true);
			});
		}
	}
	this.changeTypeSelected = function(newType) {
		var selectedlength = _selected.length;
		if(selectedlength || selectedlength > 0){
			var actions = [];
			for (var i = 0, selectedlength; i < selectedlength; i++) {
				if(_selectType === "region"){
					var regionPolygon = getRegionByID(_selected[i]);
					actions.push(new ActionChangeTypeRegionPolygon(regionPolygon, newType, _editor, _settings,_currentPage,_thisController));

					_thisController.hideRegion(newType,false);
				} else if(_selectType === "segment"){
					var isFixedSegment = (_settings.pages[_currentPage].segments[_selected[i]]);
					if(isFixedSegment){
						if(!_exportSettings[_currentPage]){
							initExportSettings(_currentPage);
						}
						actions.push(new ActionChangeTypeSegment(_selected[i], newType, _editor, _thisController, _settings, _currentPage,_exportSettings));
					}else{
						if(!_exportSettings[_currentPage]){
							initExportSettings(_currentPage);
						}
						actions.push(new ActionChangeTypeSegment(_selected[i], newType, _editor, _thisController, _segmentation, _currentPage,_exportSettings));
					}
				}
			}
			var multiChange = new ActionMultiple(actions);
			_actionController.addAndExecuteAction(multiChange,_currentPage);
		}
	}
	this.createBorder = function(doSegment) {
		_thisController.endEditing(true);
		var type = doSegment ? 'segment' : 'region';
		_editor.startCreateBorder(type);
		if(doSegment){
			//currently not in gui: _gui.selectToolBarButton('createSegmentBorder',true);
		}else{
			_gui.selectToolBarButton('regionBorder',true);
		}
	}
	this.callbackNewRegion = function(regionpoints,regiontype) {
		var newID = "created" + _newPathCounter;
		_newPathCounter++;
		if(!regiontype){
			type = _presentRegions[0];
			if(!type){
				type = "other";
			}
		}else{
			type = regiontype;
		}

		var actionAdd = new ActionAddRegion(newID, regionpoints, type,
				_editor, _settings, _currentPage);

		_actionController.addAndExecuteAction(actionAdd,_currentPage);
		if(!regiontype){
			_thisController.openContextMenu(false,newID);
		}
		_gui.unselectAllToolBarButtons();
	}

	this.callbackNewRoI = function(regionpoints) {
		var left = 1;
		var right = 0;
		var top = 1;
		var down = 0;

		$.each(regionpoints, function(index, point) {
			if(point.x < left)
				left = point.x;
			if(point.x > right)
				right = point.x;
			if(point.y < top)
				top = point.y;
			if(point.y > down)
				down = point.y;
		});

		var actions = [];

		//Create 'inverted' ignore rectangle
		actions.push(new ActionAddRegion("created" + _newPathCounter, [{x:0,y:0},{x:1,y:0},{x:1,y:top},{x:0,y:top}], 'ignore',
				_editor, _settings, _currentPage));
		_newPathCounter++;

		actions.push(new ActionAddRegion("created" + _newPathCounter, [{x:0,y:0},{x:left,y:0},{x:left,y:1},{x:0,y:1}], 'ignore',
				_editor, _settings, _currentPage));
		_newPathCounter++;

		actions.push(new ActionAddRegion("created" + _newPathCounter, [{x:0,y:down},{x:1,y:down},{x:1,y:1},{x:0,y:1}], 'ignore',
				_editor, _settings, _currentPage));
		_newPathCounter++;

		actions.push(new ActionAddRegion("created" + _newPathCounter, [{x:right,y:0},{x:1,y:0},{x:1,y:1},{x:right,y:1}], 'ignore',
				_editor, _settings, _currentPage));
		_newPathCounter++;

		_actionController.addAndExecuteAction(new ActionMultiple(actions),_currentPage);
		_gui.unselectAllToolBarButtons();
	}

	this.callbackNewFixedSegment = function(segmentpoints) {
		var newID = "created" + _newPathCounter;
		_newPathCounter++;
		var type = _presentRegions[0];
		if(!type){
			type = "other";
		}
		if(!_exportSettings[_currentPage]){
			initExportSettings(_currentPage);
		}
		var actionAdd = new ActionAddFixedSegment(newID, segmentpoints, type,
				_editor, _settings, _currentPage,_exportSettings,_thisController);

		_actionController.addAndExecuteAction(actionAdd,_currentPage);
		_thisController.openContextMenu(false,newID);
		_gui.unselectAllToolBarButtons();
	}
	this.callbackNewCut = function(segmentpoints) {
		var newID = "created" + _newPathCounter;
		_newPathCounter++;

		var actionAdd = new ActionAddCut(newID, segmentpoints,
				_editor, _settings, _currentPage);

		_actionController.addAndExecuteAction(actionAdd,_currentPage);
		_gui.unselectAllToolBarButtons();
	}

	this.transformSegment = function(segmentID,segmentPoints){
		var polygonType = getPolygonMainType(segmentID);
		if(polygonType === "fixed"){
			var actionTransformSegment = new ActionTransformSegment(segmentID,segmentPoints,_editor,_settings,_currentPage);
			_actionController.addAndExecuteAction(actionTransformSegment,_currentPage);
		}
	}

	this.transformRegion = function(regionID,regionSegments){
		var polygonType = getPolygonMainType(regionID);
		if(polygonType === "region"){
			var regionType = getRegionByID(regionID).type;
			var actionTransformRegion = new ActionTransformRegion(regionID,regionSegments,regionType, _editor, _settings, _currentPage,_thisController);
			_actionController.addAndExecuteAction(actionTransformRegion,_currentPage);
			_thisController.hideRegion(regionType,false);
		}
	}

	this.changeRegionType = function(id, type){
		var polygonType = getPolygonMainType(id);
		if(polygonType === "region"){
			var regionPolygon = getRegionByID(id);
			if(regionPolygon.type != type){
				var actionChangeType = new ActionChangeTypeRegionPolygon(regionPolygon, type, _editor, _settings, _currentPage,_thisController);
				_actionController.addAndExecuteAction(actionChangeType,_currentPage);
			}
			_thisController.hideRegion(type,false);
		}else if(polygonType === "segment" || polygonType === "fixed"){
			// is Segment
			_thisController.changeSegmentType(id,type);
		}
	}

	this.changeSegmentType = function(id, type){
		var polygonType = getPolygonMainType(id);
		if(polygonType === "result"){
			if(_segmentation.pages[_currentPage].segments[id].type != type){
				if(!_exportSettings[_currentPage]){
					initExportSettings(_currentPage);
				}
				var actionChangeType = new ActionChangeTypeSegment(id, type, _editor, _thisController, _segmentation, _currentPage,_exportSettings);
				_actionController.addAndExecuteAction(actionChangeType,_currentPage);
			}
		}else if(polygonType === "fixed"){
			//segment is fixed segment not result segment
			if(_settings.pages[_currentPage].segments[id].type != type){
				var actionChangeType = new ActionChangeTypeSegment(id, type, _editor, _thisController, _settings, _currentPage,_exportSettings);
				_actionController.addAndExecuteAction(actionChangeType,_currentPage);
			}
		}

	}

	this.openRegionSettings = function(regionType,doCreate){
		var region = _settings.regions[regionType];
		if(!region){
			region = _settings.regions['paragraph']; //TODO replace, is to fixed
		}
		var color;
		if(_specifiedColors[regionType]){
			color = _specifiedColors[regionType];
		}else{
			color = _colors[_thisController.getAvailableColorIndexes()[0]];
		}

		_gui.openRegionSettings(regionType,region.minSize,region.maxOccurances,region.priorityPosition,doCreate,color);
	}

	this.getColor = function(colorID){
		return colors[colorID];
	}

	this.getColorID = function(color){
		var id = 0;
		for(id = 0; id < _colors.length; id++){
			if(color.toCSS() === _colors[id].toCSS()){
				return id;
			}
		}
		return -1;
	}

	this.setRegionColor = function(regionType,colorID){
		_specifiedColors[regionType] = _colors[colorID];

		var pageSegments = _segmentation.pages[_currentPage].segments;
		var pageFixedSegments = _settings.pages[_currentPage].segments;
		Object.keys(pageSegments).forEach(function(key) {
			if(!pageFixedSegments[key] && !(_exportSettings[_currentPage] && $.inArray(key,_exportSettings[_currentPage].segmentsToIgnore) >= 0)){
				var segment = pageSegments[key];
				if(segment.type === regionType){
					_editor.updateSegment(segment);
				}
			}
		});
		// Iterate over FixedSegment-"Map" (Object in JS)
		Object.keys(pageFixedSegments).forEach(function(key) {
			var segment = pageSegments[key];
			if(segment.type === regionType){
				_editor.updateSegment(segment);
			}
		});

		var region = _settings.regions[regionType];
		// Iterate over all Polygons in Region
		Object.keys(region.polygons).forEach(function(polygonKey) {
			var polygon = region.polygons[polygonKey];
			if(polygon.type === regionType){
				_editor.updateSegment(polygon);
			}
		});
		_gui.setRegionLegendColors(_segmentationtypes);
		_gui.updateAvailableColors(_thisController.getAvailableColorIndexes());
	}

	this.getAvailableColorIndexes = function(){
		var freeColorIndexes = Array.apply(null, {length: _colors.length}).map(Number.call, Number);

		for (var regionType in _specifiedColors) {
			var index = _colors.indexOf(_specifiedColors[regionType]);
			if (index > -1) {
		    freeColorIndexes.splice(freeColorIndexes.indexOf(index), 1);
			}
		}
		return freeColorIndexes;
	}

	this.autoGenerateReadingOrder = function(){
		_thisController.endCreateReadingOrder();
		if(!_exportSettings[_currentPage]){
			initExportSettings(_currentPage);
		}
		var readingOrder = [];
		var pageSegments = _segmentation.pages[_currentPage].segments;
		var pageFixedSegments = _settings.pages[_currentPage].segments;
		
		// Iterate over Segment-"Map" (Object in JS)
		Object.keys(pageSegments).forEach(function(key) {
			var hasFixedSegmentCounterpart = false;
			if(!pageFixedSegments[key] && !(_exportSettings[_currentPage] && $.inArray(key,_exportSettings[_currentPage].segmentsToIgnore) >= 0)){
				//has no fixedSegment counterpart and has not been deleted
				var segment = pageSegments[key];
				if(segment.type !== 'image'){
					readingOrder.push(segment);
				}
			}
		});
		// Iterate over FixedSegment-"Map" (Object in JS)
		Object.keys(pageFixedSegments).forEach(function(key) {
			var segment = pageFixedSegments[key];
			if(segment.type !== 'image'){
				readingOrder.push(segment);
			}
		});
		readingOrder = _editor.getSortedReadingOrder(readingOrder);
		_actionController.addAndExecuteAction(new ActionChangeReadingOrder(_exportSettings[_currentPage].readingOrder,readingOrder,_thisController,_exportSettings,_currentPage),_currentPage);
	}

	this.createReadingOrder = function(){
		_actionController.addAndExecuteAction(new ActionChangeReadingOrder(_exportSettings[_currentPage].readingOrder,[],_thisController,_exportSettings,_currentPage),_currentPage);
		_editReadingOrder = true;
		_gui.doEditReadingOrder(true);
	}

	this.endCreateReadingOrder = function(){
		_editReadingOrder = false;
		_gui.doEditReadingOrder(false);
	}
	
	this.setBeforeInReadingOrder = function(segment1ID,segment2ID,doUpdate){
		if(!_tempReadingOrder){
			_tempReadingOrder = JSON.parse(JSON.stringify(_exportSettings[_currentPage].readingOrder));
		}
		
		var readingOrder = _tempReadingOrder;
		var index1;
		var segment1;
		var segment2;
		for(var index = 0; index < readingOrder.length; index++){
			var currentSegment = readingOrder[index];
			if(currentSegment.id === segment1ID){
				index1 = index;
				segment1 = currentSegment;
			}else if(currentSegment.id === segment2ID){
				segment2 = currentSegment;
			}
		}
		readingOrder.splice(index1,1);
		readingOrder.splice(readingOrder.indexOf(segment2), 0, segment1);
		if(doUpdate){
			_gui.setBeforeInReadingOrder(segment1ID,segment2ID);
			
			_actionController.addAndExecuteAction(new ActionChangeReadingOrder(_exportSettings[_currentPage].readingOrder,_tempReadingOrder,_thisController,_exportSettings,_currentPage),_currentPage);
		}
		_thisController.displayReadingOrder(_displayReadingOrder,true);
	}

	this.displayReadingOrder = function(doDisplay,doUseTempReadingOrder){
		_displayReadingOrder = doDisplay;
		if(doDisplay){
			var readingOrder = doUseTempReadingOrder? _tempReadingOrder : _exportSettings[_currentPage].readingOrder;
			_editor.displayReadingOrder(readingOrder);
		}else{
			_editor.hideReadingOrder();
		}
		_gui.displayReadingOrder(doDisplay);
	}

	this.forceUpdateReadingOrder = function(forceHard){
		_gui.forceUpdateReadingOrder(_exportSettings[_currentPage].readingOrder,forceHard);
		_gui.setRegionLegendColors(_segmentationtypes);
		_guiInput.addDynamicListeners();
		_thisController.displayReadingOrder(_displayReadingOrder);
	}

	this.removeFromReadingOrder = function(segmentID){
		_actionController.addAndExecuteAction(new ActionRemoveFromReadingOrder(segmentID,_currentPage,_exportSettings,_thisController),_currentPage);
	}

	this.changeImageMode = function(imageMode){
		_settings.imageSegType = imageMode;
	}

	this.changeImageCombine = function(doCombine){
		_settings.combine = doCombine;
	}

	this.applyGrid = function(){
		if(!_gridIsActive){
			_editor.addGrid();
		}
		_gridIsActive = true;
	}

	this.removeGrid = function(){
		if(_gridIsActive){
			_editor.removeGrid();
			_gridIsActive = false;
		}
	}

	var readingOrderContains = function(segmentID){
		var readingOrder = _exportSettings[_currentPage].readingOrder;
		for(var i = 0; i < readingOrder.length; i++){
			if(readingOrder[i].id === segmentID){
				return true;
			}
		}
		return false;
	}
	// Display
	this.selectSegment = function(sectionID, info) {
		var currentType = (!info) ? "segment" : info.type;

		if(_editReadingOrder && currentType === 'segment'){
			var segment = getPolygon(sectionID);
			if(!readingOrderContains(sectionID)){
				_actionController.addAndExecuteAction(new ActionAddToReadingOrder(segment,_currentPage,_exportSettings,_thisController),_currentPage);
			}
		} else {
			_thisController.closeContextMenu();

			if (!this.selectmultiple || currentType !== _selectType) {
				_thisController.unSelect();
			}
			_selectType = currentType;

			// check if segment is already selected
			var selectIndex = _selected.indexOf(sectionID);
			if (selectIndex < 0) {
				// add segment to selection
				_editor.selectSegment(sectionID, true);
				_selected.push(sectionID);
			}else{
				// unselect segment
				_editor.selectSegment(sectionID, false);
				_selected.splice(selectIndex,1);
			}
		}
	}
	this.unSelect = function(){
		for (var i = 0, selectedsize = _selected.length; i < selectedsize; i++) {
			_editor.selectSegment(_selected[i], false);
		}
		_selected = [];
	}
	this.hasSegmentsSelected = function(){
		if(_selected && _selected.length > 0){
			return true;
		}else{
			return false;
		}
	}
	this.isSegmentSelected = function(segmentID){
		if(_selected && $.inArray(segmentID, _selected) >= 0){
			return true;
		}else{
			return false;
		}
	}
	this.startRectangleSelect = function(){
		if(!_editor.isEditing){
			if(!_isSelecting){
				_editor.startRectangleSelect();
			}

			_isSelecting = true;
		}
	}
	this.rectangleSelect = function(pointA,pointB) {
		if ((!this.selectmultiple) || !(_selectType === 'fixed' || _selectType === 'segment')) {
			_thisController.unSelect();
		}

		var inbetween = _editor.getSegmentIDsBetweenPoints(pointA,pointB);

		$.each(inbetween, function( index, id ) {
			var mainType = getPolygonMainType(id);
			mainType = (mainType === 'result' || mainType === 'fixed') ? 'segment' : mainType;
			if(mainType === 'segment'){
				_selected.push(id);
				_editor.selectSegment(id, true);
			}
		});

		_selectType = 'segment';
		_isSelecting = false;
	}
	this.toggleSegment = function(sectionID, isSelected, info) {
		if(!_editor.isEditing){
			_editor.selectSegment(sectionID, isSelected);
			_gui.highlightSegment(sectionID, isSelected);
		}
	}
	this.enterSegment = function(sectionID, info) {
		if(!_editor.isEditing){
			_editor.highlightSegment(sectionID, true);
			_gui.highlightSegment(sectionID, true);
		}
	}
	this.leaveSegment = function(sectionID, info) {
		if(!_editor.isEditing){
			_editor.highlightSegment(sectionID, false);
			_gui.highlightSegment(sectionID,false);
		}
	}
	this.hideAllRegions = function(doHide){
		// Iterate over Regions-"Map" (Object in JS)
		Object.keys(_settings.regions).forEach(function(key) {
			var region = _settings.regions[key];
			if(region.type !== 'ignore'){
				// Iterate over all Polygons in Region
				Object.keys(region.polygons).forEach(function(polygonKey) {
					var polygon = region.polygons[polygonKey];
					_editor.hideSegment(polygon.id,doHide);
				});

				_visibleRegions[region.type] = !doHide;
			}
		});
	}
	this.hideRegion = function(regionType, doHide){
		_visibleRegions[regionType] = !doHide;

		var region = _settings.regions[regionType];
		// Iterate over all Polygons in Region
		Object.keys(region.polygons).forEach(function(polygonKey) {
			var polygon = region.polygons[polygonKey];
			_editor.hideSegment(polygon.id,doHide);
		});
		_gui.forceUpdateRegionHide(_visibleRegions);
	}
	this.changeRegionSettings = function(regionType, minSize, maxOccurances){
		var region = _settings.regions[regionType];
		//create Region if not present
		if(!region){
			region = {};
			region.type = regionType;
			region.polygons = {};
			_settings.regions[regionType] = region;
			_presentRegions.push(regionType);
			_gui.showUsedRegionLegends(_presentRegions);
		}
		region.minSize = minSize;
		region.maxOccurances = maxOccurances;
	}
	this.deleteRegionSettings = function(regionType){
		if($.inArray(regionType, _presentRegions) >= 0 && regionType != 'image' && regionType != 'paragraph'){
			_actionController.addAndExecuteAction(new ActionRemoveCompleteRegion(regionType,_thisController,_editor,_settings,_thisController),_currentPage);
		}
	}
	this.showPreloader = function(doShow){
		if(doShow){
			$('#preloader').removeClass('hide');
		}else{
			$('#preloader').addClass('hide');
		}
	}
	this.moveImage = function(delta){
		if(!_editor.isEditing){
			_editor.movePoint(delta);
		}
	}
	this.openContextMenu = function(doSelected,id){
		if(doSelected && _selected && _selected.length > 0 && (_selectType === 'region' || _selectType === "fixed" || _selectType === "segment")){
			_gui.openContextMenu(doSelected, id);
		} else {
			var polygonType = getPolygonMainType(id);
			if(polygonType === 'region' || polygonType === "fixed" || polygonType === "segment"){
				_gui.openContextMenu(doSelected, id);
			}
		}
	}
	this.closeContextMenu = function(){
		_gui.closeContextMenu();
	}
	this.escape = function(){
			_thisController.unSelect();
			_thisController.closeContextMenu();
			_thisController.endEditing(true);
			_gui.closeRegionSettings();
	}

	this.setPageDownloadable = function(page,isDownloadable){
		if(page === _currentPage){
			// Reset Downloadable
			_currentPageDownloadable = isDownloadable;
			_gui.setDownloadable(_currentPageDownloadable);
		}
	}
	
	this.allowToLoadExistingSegmentation = function(allowLoadLocal){
		_allowLoadLocal = allowLoadLocal;
	}

	var getRegionByID = function(id){
		var regionPolygon;
		Object.keys(_settings.regions).some(function(key) {
			var region = _settings.regions[key];

			var polygon = region.polygons[id];
			if(polygon){
				regionPolygon = polygon;
				return true;
			}
		});
		return regionPolygon;
	}

	var getPolygonMainType = function(polygonID){
		var polygon = _settings.pages[_currentPage].segments[polygonID];
		if(polygon){
			return "fixed";
		}

		polygon = _segmentation.pages[_currentPage].segments[polygonID];
		if(polygon){
			return "result";
		}

		polygon = getRegionByID(polygonID);
		if(polygon){
			return "region";
		}

		polygon = _settings.pages[_currentPage].cuts[polygonID];
		if(polygon){
			return "cut";
		}
	}

	var getPolygon = function(polygonID){
		var polygon = _settings.pages[_currentPage].segments[polygonID];
		if(polygon){
			return polygon;
		}

		polygon = _segmentation.pages[_currentPage].segments[polygonID];
		if(polygon){
			return polygon;
		}

		polygon = getRegionByID(polygonID);
		if(polygon){
			return polygon;
		}

		polygon = _settings.pages[_currentPage].cuts[polygonID];
		if(polygon){
			return polygon;
		}
	}

	var initExportSettings = function(page){
		_exportSettings[page] = {}
		_exportSettings[page].segmentsToIgnore = [];
		_exportSettings[page].segmentsToMerge = {};
		_exportSettings[page].changedTypes = {};
		_exportSettings[page].fixedRegions = [];
		_exportSettings[page].readingOrder = [];
	}
}
