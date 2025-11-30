import { AppRegistry } from 'react-native';
import 'react-native-get-random-values'; // Must be first import
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
