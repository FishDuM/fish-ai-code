// ============ API Response ============

export interface BaseResponse<T> {
  code: number;
  data: T;
  message: string;
}

export interface PageResult<T> {
  records: T[];
  totalRow: number;
  pageSize: number;
  pageNum: number;
}

export interface PageRequest {
  pageNum: number;
  pageSize: number;
  sortField?: string;
  sortOrder?: string;
}

// ============ User ============

export interface LoginUserVO {
  id: string;
  userAccount: string;
  userName: string | null;
  userAvatar: string | null;
  userProfile: string | null;
  userRole: string;
  createTime: string;
  updateTime: string;
}

export interface UserVO {
  id: string;
  userAccount: string;
  userName: string | null;
  userAvatar: string | null;
  userProfile: string | null;
  userRole: string;
  createTime: string;
}

export interface UserLoginRequest {
  userAccount: string;
  userPassword: string;
}

export interface UserRegisterRequest {
  userAccount: string;
  userPassword: string;
  checkPassword: string;
}

export interface UserAddRequest {
  userName: string;
  userAccount: string;
  userAvatar?: string;
  userProfile?: string;
  userRole?: string;
}

export interface UserUpdateRequest {
  id: string;
  userName?: string;
  userAvatar?: string;
  userProfile?: string;
  userRole?: string;
}

export interface UserQueryRequest extends PageRequest {
  id?: string;
  userName?: string;
  userAccount?: string;
  userProfile?: string;
  userRole?: string;
}

// ============ App ============

export interface AppVO {
  id: string;
  appName: string | null;
  cover: string | null;
  codeGenType: string | null;
  priority: number | null;
  userId: string;
  createTime: string;
}

export interface App {
  id: string;
  appName: string | null;
  cover: string | null;
  initPrompt: string | null;
  codeGenType: string | null;
  deployKey: string | null;
  deployedTime: string | null;
  priority: number | null;
  userId: string;
  editTime: string | null;
  createTime: string;
  updateTime: string;
}

export interface AppAddRequest {
  appName?: string;
  cover?: string;
  initPrompt: string;
  codeGenType?: string;
}

export interface AppUpdateRequest {
  id: string;
  appName: string;
}

export interface AppQueryRequest extends PageRequest {
  appName?: string;
}

export interface DeleteRequest {
  id: string;
}

export interface AdminAppUpdateRequest {
  id: string;
  appName?: string;
  cover?: string;
  priority?: number;
}

export interface AdminAppQueryRequest extends PageRequest {
  id?: string;
  appName?: string;
  cover?: string;
  initPrompt?: string;
  codeGenType?: string;
  deployKey?: string;
  priority?: number;
  userId?: string;
}
