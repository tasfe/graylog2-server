import React from 'react';
import Reflux from 'reflux';
import { Col, Row } from 'react-bootstrap';
import Immutable from 'immutable';
import moment from 'moment';

import CurrentUserStore from 'stores/users/CurrentUserStore';
import DashboardsStore from 'stores/dashboards/DashboardsStore';
import InputsStore from 'stores/inputs/InputsStore';
import MessageFieldsStore from 'stores/messages/MessageFieldsStore';
import NodesStore from 'stores/nodes/NodesStore';
import StreamsStore from 'stores/streams/StreamsStore';
import UniversalSearchStore from 'stores/search/UniversalSearchStore';

import SearchStore from 'stores/search/SearchStore';

import NodesActions from 'actions/nodes/NodesActions';

import { Spinner } from 'components/common';
import { SearchResult } from 'components/search';

const SearchPage = React.createClass({
  getInitialState() {
    return {
      selectedFields: ['message', 'source'],
    };
  },
  mixins: [Reflux.connect(NodesStore), Reflux.connect(MessageFieldsStore), Reflux.connect(CurrentUserStore)],
  componentDidMount() {
    const query = SearchStore.query.length > 0 ? SearchStore.query : '*';
    UniversalSearchStore.search(SearchStore.rangeType, query, SearchStore.rangeParams.toJS()).then((response) => {
      this.setState({searchResult: response});

      const interval = this.props.location.query.interval ? this.props.location.query.interval : this._determineHistogramResolution(response);

      UniversalSearchStore.histogram(SearchStore.rangeType, query, SearchStore.rangeParams.toJS(), interval).then((histogram) => {
        this.setState({histogram: histogram});
      });
    });
    InputsStore.list((inputs) => {
      const inputsMap = {};
      inputs.forEach((input) => inputsMap[input.input_id] = input);
      this.setState({inputs: Immutable.Map(inputsMap)});
    });

    StreamsStore.listStreams().then((streams) => {
      const streamsMap = {};
      streams.forEach((stream) => streamsMap[stream.id] = stream);
      this.setState({streams: Immutable.Map(streamsMap)});
    });

    NodesActions.list();
    DashboardsStore.updateWritableDashboards();
  },
  _determineHistogramResolution(response) {
    let queryRangeInMinutes;
    if (SearchStore.rangeType === 'relative' && SearchStore.rangeParams.get('relative') === 0) {
      const oldestIndex = Object.keys(response.used_indices)
        .map((key) => response.used_indices[key])
        .sort((i1, i2) => moment(i1.end).isAfter(i2.end))[0];
      queryRangeInMinutes = moment(response.to).diff(oldestIndex.begin, 'minutes');
    } else {
      queryRangeInMinutes = moment(response.to).diff(response.from, 'minutes');
    }

    const duration = moment.duration(queryRangeInMinutes, 'minutes');

    if (duration.hours() < 12) {
      return 'minute';
    }

    if (duration.days() < 2) {
      return 'hour';
    }

    if (duration.days() < 30) {
      return 'day';
    }

    if (duration.days() < 6*30) {
      return 'week';
    }

    if (duration.days() < 2*365) {
      return 'month';
    }

    if (duration.days() < 10*365) {
      return 'quarter';
    }

    return 'year';
  },
  sortFields(fieldSet) {
    let newFieldSet = fieldSet;
    let sortedFields = Immutable.OrderedSet();

    if (newFieldSet.contains('source')) {
      sortedFields = sortedFields.add('source');
    }
    newFieldSet = newFieldSet.delete('source');
    const remainingFieldsSorted = newFieldSet.sort((field1, field2) => field1.toLowerCase().localeCompare(field2.toLowerCase()));
    return sortedFields.concat(remainingFieldsSorted);
  },

  _onToggled(fieldName) {
    if (this.state.selectedFields.indexOf(fieldName) > 0) {
      this.setState({selectedFields: this.state.selectedFields.filter((field) => field !== fieldName)});
    } else {
      this.setState({selectedFields: this.state.selectedFields.concat(fieldName)});
    }
  },
  _formatHistogram(results) {
    return Object.keys(results).map((key) => {
      return {x: Number(key), y: results[key]};
    });
  },

  render() {
    if (!this.state.searchResult || !this.state.inputs || !this.state.streams || !this.state.nodes || !this.state.fields || !this.state.histogram) {
      return <Spinner />;
    }
    const searchResult = this.state.searchResult;
    searchResult.all_fields = this.state.fields;
    const selectedFields = this.sortFields(Immutable.List(this.state.selectedFields));
    return (
      <SearchResult query={SearchStore.query} builtQuery={searchResult.built_query}
                    result={searchResult} histogram={this.state.histogram}
                    formattedHistogram={this._formatHistogram(this.state.histogram.results)}
                    streams={this.state.streams} inputs={this.state.inputs} nodes={Immutable.Map(this.state.nodes)}
                    searchInStream={null} permissions={this.state.currentUser.permissions} />
    );
  },
});

export default SearchPage;
