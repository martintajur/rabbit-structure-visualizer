$(function() {
	var delayTimer = null,
		updateDelayTimer = null;

	$(document).on('rsv-service-added rsv-service-removed rsv-service-switched', bindTextareas);
	$(document).on('rsv-service-added rsv-service-removed rsv-service-switched rsv-service-renamed', function() {
		if (updateDelayTimer) {
			clearTimeout(updateDelayTimer);
		}
		updateDelayTimer = setTimeout(function() {
			reactToChange();
		}, 200);
	});

	function bindTextareas() {
		$('.json-input').off('change keyup').on('change keyup', reactToChange);
		$('.json-input').off('blur').on('blur', function() {
			try {
				$(this).val(JSON.stringify(JSON.parse($(this).val()), null, 3)).change();
			} catch (e) {
				// ignore errors
			}
			reactToChange();
		});
	}

	function reactToChange() {
		var combinedData = {
			exchanges: [],
			queues: [],
			services: []
		};

		$('.json-input').each(function() {
			if (!$(this).val()) return;
			var data = {},
				serviceData = _.clone(services[$(this).data('service-id')]);

			try {
				data = JSON.parse($(this).val());
			}
			catch (err) {
				console.warn(err);
			}

			combinedData.services.push(serviceData);

			if (data && data.exchanges) {
				_.each(data.exchanges, function(exchange, i) {
					if (!exchange || !exchange.name) return;
					var existingExchange = _.find(combinedData.exchanges, { name: exchange.name });
					if (existingExchange) {
						existingExchange.options = _.extend({}, existingExchange.options, exchange.options);
						data.exchanges.splice(i);
						// TODO: validate exchange properties and alert if there is a mismatch
					}
				});
				combinedData.exchanges = combinedData.exchanges.concat(data.exchanges);
			}
			if (data && data.queues) {
				_.each(data.queues, function(queue, i) {
					if (!queue || !queue.name) return;
					if (!queue.serviceIds) queue.serviceIds = [];
					queue.serviceIds.push(serviceData.id);
					var existingQueue = _.find(combinedData.queues, { name: queue.name });
					if (existingQueue) {
						existingQueue.bindings = existingQueue.bindings.concat(queue.bindings);
						existingQueue.serviceIds = existingQueue.serviceIds.concat(queue.serviceIds);
						existingQueue.options = _.extend({}, existingQueue.options, queue.options);
						data.queues.splice(i);
						// TODO: validate queue properties and alert if there is a mismatch
					}
				});
				combinedData.queues = combinedData.queues.concat(data.queues);
			}
			$(document).trigger('rsv-service-json-updated', { id: $(this).data('service-id'), json: data });
		});

		renderStructureWithDelay(combinedData);
	}

	function renderStructureWithDelay(structure) {
		if (delayTimer) {
			clearTimeout(delayTimer);
		}
		delayTimer = setTimeout(function() {
			renderStructure(structure);
		}, 200);
	}

	function renderStructure(structure) {
		if (!structure || !structure.exchanges || !structure.queues) {
			return;
		}

		var nodes = [],
			bindings = [],
			links = [],
			consumerBindings = [],
			exchangeFmt = _.template('Exchange: <%- name %>'),
			queueFmt = _.template('Queue: <%- name %>'),
			serviceFmt = _.template('Consumer: <%- name %>'),
			bindingFmt = _.template('→ <%- routing %> →'),
			deadLetterBindingFmt = _.template('← <%- data["x-dead-letter-exchange"] %> (<%- data["x-message-ttl"] %>ms) ←', { variable: 'data' });

		structure.exchanges.forEach(function(exchange, key) {
			exchange.name = exchangeFmt(exchange);
			exchange._index = nodes.push(exchange) - 1;
		});

		structure.services.forEach(function(service) {
			service.name = serviceFmt(service);
			service._type = 'service';
			service._index = nodes.push(service) - 1;
		});

		structure.queues.forEach(function(queue) {
			queue.name = queueFmt(queue);
			queue._index = nodes.push(queue) - 1;
			if (queue.bindings instanceof Array) {
				queue.bindings.forEach(function(binding) {
					binding._target = queue;
					binding.name = bindingFmt(binding);
					binding._source = _.find(nodes, { name: exchangeFmt({name: binding.exchange}) });
					bindings.push(binding);
					binding._index = nodes.push(binding) - 1;
				});
			}
			if (queue.options && queue.options.arguments && queue.options.arguments['x-dead-letter-exchange']) {
				var deadLetterBinding = {
					_source: _.find(nodes, { name: exchangeFmt({name: queue.options.arguments['x-dead-letter-exchange'] }) }),
					name: deadLetterBindingFmt(queue.options.arguments),
					_target: queue,
					_value: 0.5
				};
				bindings.push(deadLetterBinding);
				deadLetterBinding._index = nodes.push(deadLetterBinding) - 1;
			}

			queue.serviceIds.forEach(function(serviceId) {
				var consumerBinding = {
					source: queue._index,
					target: _.find(nodes, { '_type': 'service', id: serviceId })._index,
					value: 1
				};

				consumerBindings.push(consumerBinding);
			});
		});

		bindings.forEach(function(binding) {
			// look up source...
			var linkSource = {},
				linkTarget = {};

			if (!binding._source) {
				console.warn('Source not found for binding ' + binding.name);
				return;
			}

			linkSource.source = binding._source._index;
			linkSource.target = binding._index;
			linkSource.value = binding._value || 1;

			// ...and then target
			var targetCandidate = _.find(nodes, { name: binding._target.name });

			if (!targetCandidate || !targetCandidate._index) {
				throw new Error('Target not found for binding ' + binding.name);
			}

			linkTarget.source = binding._index;
			linkTarget.target = targetCandidate._index;
			linkTarget.value = binding._value || 1;

			links.push(linkSource);
			links.push(linkTarget);
		});

		consumerBindings.forEach(function(consumerBinding) {
			consumerBinding.value = getNodeSum(consumerBinding.source) / _.filter(consumerBindings, { source: consumerBinding.source }).length;
		});

		consumerBindings.forEach(function(consumerBinding) {
			links.push(consumerBinding);
		});

		$('#chart').css('height', Math.max(250, Math.max(nodes.length, links.length) * 35));

		var chart = d3
				.select('#chart')
				.html('')
				.append('svg')
				.chart('Sankey.Path');

		chart
			.nodeWidth(20)
			.nodePadding(25)
			.iterations(90)
			.spread(true)
			.name(function(n) { return n.name; })
			.colorNodes(function(name, node) {
				if (name && name.toLowerCase().indexOf('queue') > -1) return '#f6b26b';
				if (name && name.toLowerCase().indexOf('→') > -1) return '#9ec4e8';
				if (name && name.toLowerCase().indexOf('←') > -1) return '#f00';
				if (name && name.toLowerCase().indexOf('consumer') > -1) return '#0ff';
				return '#fff176';
			})
			.colorLinks(function(link) {
				if (link.target.name.toLowerCase().indexOf('←') > -1 || link.source.name.toLowerCase().indexOf('←') > -1) return '#f00';
				if (link.target.name.toLowerCase().indexOf('consumer') > -1) return '#0ff';
				return '#999';
			});

		var chartData = {
			nodes: nodes,
			links: links
		};

		chart.draw(chartData);

		function getNodeSum(index) {
			var targetSum = 0,
				sourceSum = 0;

			_.each(links, function(link) {
				if (link.target === index) targetSum += link.value;
				if (link.source === index) sourceSum += link.value;
			});

			return Math.max(targetSum, sourceSum);
		}
	}
});