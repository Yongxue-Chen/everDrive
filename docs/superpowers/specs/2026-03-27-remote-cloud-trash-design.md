# everDrive Remote Cloud Trash Design

## Goal

将“自建云端回收站”从当前全局设置改为每个云盘单独控制，并明确该能力只用于 `mirror` 模式下的远端删除动作。

## Current State

- 后端当前只有全局 `settings.cloudTrash` 配置。
- `sync-executor` 在执行删除时读取全局设置决定是否移动到 trash。
- 现有设计文档明确不支持 per-remote / per-mapping-task trash policy。
- 前端云盘管理页和映射页都没有暴露 remote 级 cloud trash 配置。

## Scope

本次只做：

- 每个云盘单独开启/关闭自建云端回收站
- 每个云盘单独配置回收站基础路径
- `mirror` 模式删除时按目标 remote 的开关决定“直删”还是“移入 trash”
- 云盘管理页提供配置入口

本次不做：

- provider-native trash API
- mapping task 级 trash 开关
- archive 模式下的 trash 逻辑
- 不同 remote 共享一个全局 trash 开关

## Recommended Approach

把 cloud trash 配置下沉到 remote 记录本身，执行链路在“具体删除到哪个 remote”这一层做判断，而不是在全局 settings 做统一判断。

这是最贴近业务语义的实现：trash 行为本来就是 remote-specific，配置也应该和 remote 生命周期绑定。这样云盘管理页可以直接编辑，执行器也不用再把“全局开关”投射到单个 remote 上。

## Data Model

为 remote 增加以下字段：

- `cloudTrashEnabled: boolean`
- `cloudTrashBasePath: string`

默认值：

- `cloudTrashEnabled = false`
- `cloudTrashBasePath = ".everdrive-trash"`

返回 remote 列表和更新 remote 配置的接口都要带回这两个字段。

## Backend Behavior

### Sync Execution

当 `sync-executor` 在 `mirror` 模式下处理 delete action 时：

1. 找到删除目标对应的 remote
2. 读取该 remote 的 `cloudTrashEnabled`
3. 若为 `true`，把远端文件移动到该 remote 的 `cloudTrashBasePath/YYYY/MM/DD/<mappingTaskId>/<original-relative-path>`
4. 若为 `false`，保持现有直接删除行为

约束：

- 只在 `mirror` 删除动作生效
- `archive` 模式不变
- move-to-trash 失败时不得静默回退为直删
- path conflict 继续沿用现有时间戳后缀策略

### Settings

现有全局 `settings.cloudTrash` 从执行链路移除，不再作为删除行为的决策来源。

这次不要求立即删除 settings 中的旧字段，但要保证它不会继续影响 sync executor。前端系统设置页也不再承载该能力。

## Frontend Behavior

### Cloud Remotes Page

在云盘管理页为每个 remote 增加：

- “启用自建云端回收站”开关
- 开启后显示“回收站基础路径”输入框

保存时走 remote 更新接口，不走 settings 接口。

文案要明确：

- 该能力只对 `mirror` 模式删除生效
- 关闭时仍会直接删除远端文件

### Mapping Tasks Page

映射新建/编辑页不新增 trash 开关，只补充提示文案即可：

- 回收站由云盘管理页按 remote 配置
- 仅在镜像模式下影响删除行为

## API Changes

需要扩展 remote 相关接口，使 remote 列表视图和 remote 更新接口支持：

- `cloudTrashEnabled`
- `cloudTrashBasePath`

如果当前 remote 更新接口只支持容量信息，则扩成统一 remote 配置更新；否则在现有更新接口上补字段。

## Testing

至少覆盖：

- remote 配置读写 API 返回新字段
- `mirror` + remote trash enabled => move to trash
- `mirror` + remote trash disabled => direct delete
- `archive` 模式不受 remote trash 开关影响
- 云盘管理页保存 remote trash 配置会调用正确接口

## Risks

- 现有全局 cloud trash 逻辑需要干净退场，否则会出现“全局开、remote 关”这类冲突状态
- remote 更新接口如果目前职责过窄，可能需要顺手整理 remote 配置更新边界
- 已有测试大量默认依赖全局 cloud trash，需要同步改成 remote 级 fixture
