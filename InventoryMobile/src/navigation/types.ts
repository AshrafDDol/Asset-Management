export type ScreenStackParamList = {
    HomeScreen: undefined;
    LoginScreen: undefined;
    RFIDDiagnosticScreen: undefined;
    PendingIssuesScreen: undefined;
    IssueConfirmationScreen: { issueId: number };
    WorkQueueScreen: undefined;
    ProcessingScanAllScreen: undefined;
    ReturnScanScreen: { issueId?: number };
    SwapScanScreen: { taskId: number };
};

export type MainTabParamList = {

};

declare global {
    namespace ReactNavigation {
        interface RootStackParamList
            extends ScreenStackParamList {}
    }
}
