import React from "react";
import { useLocation } from "react-router-dom";
import { Spin } from "@/components/ui/core";
import { ExternalContactBindingForm } from "./components/ExternalContactBindingForm";
import { useExternalContactBindingState } from "./hooks/useExternalContactBindingState";
import "./styles.less";

const ExternalContactBindingPage: React.FC = () => {
  const location = useLocation();
  const state = useExternalContactBindingState(location.search);

  if (state.loading) {
    return (
      <div className="loading-container">
        <Spin size="large" />
      </div>
    );
  }

  if (!state.showForm) {
    return <div className="unauthorized-container"><h2>{state.text}</h2></div>;
  }

  return (
    <ExternalContactBindingForm
      form={state.form}
      userContext={state.userContext}
      onSubmit={state.handleSubmit}
    />
  );
};

export default ExternalContactBindingPage;

