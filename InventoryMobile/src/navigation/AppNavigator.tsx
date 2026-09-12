import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScreenStackParamList } from './types';
import LoginScreen from '../screen/LoginScreen/LoginScreen';
import HomeScreen from '../screen/HomeScreen/HomeScreen';
import RFIDDiagnosticScreen from '../screen/RFIDDiagnosticScreen/RFIDDiagnosticScreen';

const Stack = createNativeStackNavigator<ScreenStackParamList>();

const AppNavigator: React.FC = () => {
    return (
        <Stack.Navigator initialRouteName="RFIDDiagnosticScreen">
            <Stack.Screen name="LoginScreen" component={LoginScreen} />
            <Stack.Screen name="HomeScreen" component={HomeScreen} />
            <Stack.Screen
                name="RFIDDiagnosticScreen"
                component={RFIDDiagnosticScreen}
                options={{ title: 'Asset Management Test' }}
            />
        </Stack.Navigator>
    );
};

export default AppNavigator;
