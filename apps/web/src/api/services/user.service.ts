// import type { LoginParams, UserInfo } from '../types/auth.d';
import { redirect } from "react-router-dom";
import { apiClient } from "../http/client";

export const UserService = {
  async getUsers() {
    const opportunity = await apiClient.get("/user/get");
    return opportunity.data;
  },
};
