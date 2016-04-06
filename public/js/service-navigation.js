var services = {};

$(function() {
	var storedServices,
		currentService = null;

	$('.service-dd-link').each(function(i, srv) {
		var $srv = $(srv),
			id = parseInt($srv.data('service-id'), 10);
		if (!$srv.data('service-id')) return;

		services[id] = {
			id: id,
			ddItem: $srv,
			name: $srv.text(),
			remove: removeService.bind(services[id]),
			jsonContainer: $('.json-input[data-service-id="' + id + '"]'),
			focused: false
		};
	});

	if (window.localStorage['rsv-services']) {
		// user has previously stored service structures, render these
		try {
			storedServices = JSON.parse(window.localStorage['rsv-services']);
		} catch (e) {
			window.localStorage['rsv-services'] = JSON.stringify({});
		}
		_.each(storedServices, function(srv) {
			addService(srv);
		});
	} else {
		// user has no previously stored service structures, render a default example instead
		d3.json('/example.json', function(err, json) {
			if (err) throw err;

			addService({
				id: 1,
				name: 'example-service-1',
				json: JSON.stringify(json, null, 3)
			});
		});
	}

	var focusedService = _.find(_.values(services), { 'focused': true });

	if (!focusedService) {
		focusedService = Object.keys(services).shift();
	} else {
		focusedService = focusedService.id;
	}

	switchService(focusedService);
	handleDeleteButtonState();

	$('#add-service-link').on('click', function() {
		setTimeout(addService.bind(this), 0);
	});
	$('#button-delete').on('click', function() {
		if (Object.keys(services).length <= 1) return;
		if (window.confirm('Are you sure you wish to delete ' + currentService.name + ' service?')) {
			currentService.remove();
		}
	});
	$('#button-rename').on('click', handleRename);
	$('#current-service-title').on('dblclick', handleRename);

	$(document).on('click', '.service-dd-link a', function(e) {
		switchService(parseInt($(e.target).parent().data('service-id'), 10));
	});

	$(document).on('rsv-service-json-updated rsv-service-added rsv-service-removed rsv-service-switched rsv-service-renamed', handleDeleteButtonState);

	$(document).on('rsv-service-renamed', function() {
		currentService.ddItem.find('a').text(currentService.name);
		$('#current-service-title').text(currentService.name);
	});

	$(document).on('rsv-service-json-updated rsv-service-added rsv-service-removed rsv-service-switched rsv-service-renamed', function() {
		if (!window.localStorage) return;
		var srvObj = {};

		_.each(services, function(srv) {
			srvObj[srv.id] = {
				id: srv.id,
				name: srv.name,
				json: srv.jsonContainer.val(),
				focused: srv.focused
			};
		});

		window.localStorage['rsv-services'] = JSON.stringify(srvObj);
	});

	function handleDeleteButtonState() {
		if (Object.keys(services).length <= 1) {
			$('#button-delete').prop('disabled', true);
		} else {
			$('#button-delete').prop('disabled', false);
		}
	}

	function handleRename() {
		var newname = null;
		if ((newname = window.prompt('Enter new name for ' + currentService.name, currentService.name)) !== null) {
			renameService(currentService.id, newname);
		}
	}

	function switchService(id) {
		if (!services[id]) return;
		_.each(services, function(srv, key) {
			services[key].focused = false;
		});
		services[id].focused = true;
		currentService = services[id];
		$('.service-dd-link').removeClass('active');
		$('.service-dd-link[data-service-id="' + id + '"]').addClass('active');
		$('#current-service-title').text(currentService.name);
		$('.json-input').hide();
		$('.json-input[data-service-id="' + id + '"]').show();
		$(document).trigger('rsv-service-switched', currentService);
	}

	function getLastId() {
		return Object.keys(services).sort().pop();
	}

	function addService(data) {
		if (!data) data = {};

		var lastId = getLastId(),
			id = data.id || parseInt(lastId, 10) + 1,
			srv,
			defaultName = 'example-service-' + id;

		if (data.id && services[data.id]) {
			if (data.name) renameService(data.id, data.name || defaultName);
			if (data.json) services[data.id].jsonContainer.val(data.json).change();
			srv = services[data.id];
		} else {
			srv = {
				id: data.id || id,
				ddItem: $(services[lastId].ddItem).clone().attr('id', 'service-selector-' + id).attr('data-service-id', id).insertBefore('#service-selectors-separator'),
				name: data.name || window.prompt('Enter service name', defaultName) || defaultName,
				jsonContainer: $(services[lastId].jsonContainer).clone().attr('id', 'service-selector-' + id).attr('data-service-id', id).insertAfter('.json-input:last').val(data.json || '{\n   "exchanges": [],\n   "queues": []\n}'),
				focused: !data.id || data.focused
			};
		}

		srv.ddItem.find('a').html(srv.name);
		services[id] = srv;
		services[id].remove = removeService.bind(srv);
		if (!data.id || data.focused) switchService(id);

		$(document).trigger('rsv-service-added', srv);
		services[id].jsonContainer.change();
	}

	function renameService(id, newname) {
		services[id].name = newname;
		$(document).trigger('rsv-service-renamed', services[id]);
	}

	function removeService() {
		if (Object.keys(services).length <= 1) return;
		this.ddItem.remove();
		this.jsonContainer.remove();
		$(document).trigger('rsv-service-removed', this.id);
		delete services[this.id];
		switchService(getLastId());
	}
});