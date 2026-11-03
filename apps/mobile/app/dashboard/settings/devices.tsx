import React from "react";
import { Redirect } from "expo-router";

export default function RedirectDevices() {
  return <Redirect href="/settings/devices" />;
}
