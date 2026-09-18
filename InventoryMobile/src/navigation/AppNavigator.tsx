import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { ScreenStackParamList } from './types';
import LoginScreen from '../screen/LoginScreen/LoginScreen';
import HomeScreen from '../screen/HomeScreen/HomeScreen';
import RFIDDiagnosticScreen from '../screen/RFIDDiagnosticScreen/RFIDDiagnosticScreen';
import PendingIssuesScreen from '../screen/PendingIssuesScreen/PendingIssuesScreen';
import IssueConfirmationScreen from '../screen/IssueConfirmationScreen/IssueConfirmationScreen';
import WorkQueueScreen from '../screen/WorkQueueScreen/WorkQueueScreen';
import ProcessingScanAllScreen from '../screen/ProcessingScanAllScreen/ProcessingScanAllScreen';
import ReturnScanScreen from '../screen/ReturnScanScreen/ReturnScanScreen';
import SwapScanScreen from '../screen/SwapScanScreen/SwapScanScreen';
import StockTakeQueueScreen from '../screen/StockTakeQueueScreen/StockTakeQueueScreen';
import StockTakeScanScreen from '../screen/StockTakeScanScreen/StockTakeScanScreen';
import RepairQueueScreen from '../screen/RepairQueueScreen/RepairQueueScreen';
import RepairScanScreen from '../screen/RepairScanScreen/RepairScanScreen';
import ReturnQueueScreen from '../screen/ReturnQueueScreen/ReturnQueueScreen';
import SwapQueueScreen from '../screen/SwapQueueScreen/SwapQueueScreen';

const Stack = createNativeStackNavigator<ScreenStackParamList>();

const AppNavigator: React.FC = () => {
    return (
        <Stack.Navigator initialRouteName="LoginScreen">
            <Stack.Screen name="LoginScreen" component={LoginScreen} />
            <Stack.Screen name="HomeScreen" component={HomeScreen} />
            <Stack.Screen
                name="RFIDDiagnosticScreen"
                component={RFIDDiagnosticScreen}
                options={{ title: 'Asset Management Test' }}
            />
            <Stack.Screen name="PendingIssuesScreen" component={PendingIssuesScreen} options={{ title: 'Asset Issue' }} />
            <Stack.Screen name="IssueConfirmationScreen" component={IssueConfirmationScreen} options={{ title: 'Issue Confirmation' }} />
            <Stack.Screen name="WorkQueueScreen" component={WorkQueueScreen} options={{ title: 'Work Queue' }} />
            <Stack.Screen name="ProcessingScanAllScreen" component={ProcessingScanAllScreen} options={{ title: 'Scan All Processing' }} />
            <Stack.Screen name="ReturnScanScreen" component={ReturnScanScreen} options={{ title: 'Return Verification' }} />
            <Stack.Screen name="ReturnQueueScreen" component={ReturnQueueScreen} options={{ title: 'Return' }} />
            <Stack.Screen name="SwapScanScreen" component={SwapScanScreen} options={{ title: 'Swap Verification' }} />
            <Stack.Screen name="SwapQueueScreen" component={SwapQueueScreen} options={{ title: 'Swap' }} />
            <Stack.Screen name="StockTakeQueueScreen" component={StockTakeQueueScreen} options={{ title: 'Stock Take' }} />
            <Stack.Screen name="StockTakeScanScreen" component={StockTakeScanScreen} options={{ title: 'Stock Take Scan' }} />
            <Stack.Screen name="RepairQueueScreen" component={RepairQueueScreen} options={{ title: 'Repair' }} />
            <Stack.Screen name="RepairScanScreen" component={RepairScanScreen} options={{ title: 'Repair Verification' }} />
        </Stack.Navigator>
    );
};

export default AppNavigator;
