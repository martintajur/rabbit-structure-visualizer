$(function() {
	var delayTimer = null;

	$(document).on('rsv-service-added rsv-service-removed rsv-service-switched', bindTextareas);

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
			queues: []
		};

		$('.json-input').each(function() {
			var data = {};

			try {
				data = JSON.parse($(this).val());
			}
			catch (err) {
				$(this).addClass('has-error');
				console.warn(err);
			}
			$(this).removeClass('has-error');

			if (data && data.exchanges) {
				_.each(data.exchanges, function(exchange, i) {
					if (_.find(combinedData.exchanges, { name: exchange.name })) {
						data.exchanges.splice(i);
						// TODO: validate exchange properties and alert if there is a mismatch
					}
				});
				combinedData.exchanges = combinedData.exchanges.concat(data.exchanges);
			}
			if (data && data.queues) {
				_.each(data.queues, function(queue, i) {
					var existingQueue = _.find(combinedData.queues, { name: queue.name });
					if (existingQueue) {
						existingQueue.bindings = existingQueue.bindings.concat(queue.bindings);
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

		$('#chart').css('height', Math.max(250, Math.max(structure.exchanges.length, structure.queues.length) * 60));

		var chart = d3
				.select('#chart')
				.html('')
				.append('svg')
				.chart('Sankey.Path'),
			exchangeFmt = _.template('Exchange: <%- name %>'),
			queueFmt = _.template('Queue: <%- name %>'),
			bindingFmt = _.template('→ <%- routing %> →'),
			deadLetterBindingFmt = _.template('← x-dead-letter-exchange: <%- data["x-dead-letter-exchange"] %> (<%- data["x-message-ttl"] %> ms) ←', { variable: 'data' });

		chart
			.nodeWidth(20)
			.nodePadding(25)
			.iterations(60)
			.spread(true)
			.name(function(n) { return n.name; })
			.colorNodes(function(name, node) {
				if (name && name.toLowerCase().indexOf('queue') > -1) return '#f6b26b';
				if (name && name.toLowerCase().indexOf('→') > -1) return '#9ec4e8';
				if (name && name.toLowerCase().indexOf('x-dead-letter') > -1) return '#f00';
				return '#fff176';
			})
			.colorLinks(function(link) {
				return '#999';
			});

		var nodes = [],
			bindings = [],
			links = [];

		structure.exchanges.forEach(function(exchange, key) {
			exchange.name = exchangeFmt(exchange);
			exchange._index = nodes.push(exchange) - 1;
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

		var chartData = {
			nodes: nodes,
			links: links
		};

		chart.draw(chartData);
	}
});