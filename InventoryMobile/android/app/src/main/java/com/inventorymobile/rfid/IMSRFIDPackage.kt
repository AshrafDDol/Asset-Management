package com.inventorymobile.rfid

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.inventorymobile.feedback.IMSScanFeedbackModule

class IMSRFIDPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(IMSRFIDModule(reactContext), IMSScanFeedbackModule(reactContext))

  override fun createViewManagers(
    reactContext: ReactApplicationContext,
  ): List<ViewManager<*, *>> = emptyList()
}
