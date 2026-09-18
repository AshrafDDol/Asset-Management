export type ScreenStackParamList = {
    HomeScreen: undefined;
    LoginScreen: undefined;
    RFIDDiagnosticScreen: undefined;
    PendingIssuesScreen: undefined;
    IssueConfirmationScreen: { issueId: number };
    WorkQueueScreen: undefined;
    ProcessingScanAllScreen: undefined;
    ReturnScanScreen: { issueId?: number };
    ReturnQueueScreen: undefined;
    SwapScanScreen: { taskId: number };
    SwapQueueScreen: undefined;
    StockTakeQueueScreen: undefined;
    StockTakeScanScreen: { sessionId: number };
    RepairQueueScreen: undefined;
    RepairScanScreen: { taskId: number };
};

export type MainTabParamList = {

};

declare global {
    namespace ReactNavigation {
        interface RootStackParamList
            extends ScreenStackParamList {}
    }
}
