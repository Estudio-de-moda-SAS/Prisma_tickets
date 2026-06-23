// shared/selects.ts

export const BASE_SELECT = `
  Request_ID,
  Request_Board_Column_ID,
  Request_Requested_By,
  Request_Template_ID,
  Request_Title,
  Request_Description,
  Request_Score,
  Request_Progress,
  Request_Created_At,
  Request_Parent_ID,
  Request_Estimated_Hours,
  Request_Logged_Hours,
  Request_Finished_At,
  Request_Requester_Team_ID,
  Request_Is_Confidential,
  Request_Form_Data,
  Request_Template_Schema_Snapshot,
  template_schema:TBL_Requests_Templates!Request_Template_ID (
    Request_Template_Form_Schema
  ),
  requester:TBL_Users!Request_Requested_By (
    User_Name, User_Email, User_Avatar_url,
    department:TBL_Departments!Department_ID (
      Department_Name
    )
  ),
    requester_team:TBL_Teams!Request_Requester_Team_ID (
    Team_ID, Team_Name, Team_Code
  ),
    requester_department:TBL_Departments!Request_Requester_Department_ID (
    Department_Name
  ),
  column:TBL_Board_Columns!Request_Board_Column_ID (
    Board_Column_Name, Board_Column_Slug
  ),
  assignments:TBL_Requests_Assignments (
    Request_Assignment_At,
    assignee:TBL_Users!Request_Assignment_User_ID (
      User_ID, User_Name, User_Email, User_Avatar_url
    )
  ),
  teams:TBL_Request_Team (
    team:TBL_Board_Teams!Request_Team_ID (
      Board_Team_ID, Board_Team_Code
    )
  ),
  labels:TBL_Request_Labels (
    label:TBL_Labels!Request_Labels_Label_ID (
      Label_ID, Label_Name, Label_Color, Label_Icon
    )
  ),
  sub_teams:TBL_Request_Sub_Team (
    sub_team:TBL_Sub_Teams!Request_Sub_Team_ID (
      Sub_Team_ID, Sub_Team_Name, Sub_Team_Color
    )
  ),
  sprints:TBL_Request_Sprint (
    Request_Sprint_ID,
    sprint:TBL_Sprint!Request_Sprint_ID (
      Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date
    )
  ),
  child_count:TBL_Requests!Request_Parent_ID ( count ),
closure:TBL_Request_Closure (
  Closure_ID,
  Closure_Note,
  Closure_Type,
      Attachment_URL,
    Attachment_Name,
    Attachment_Mime,
    Closed_At,
    closer:TBL_Users!Closed_By ( User_ID, User_Name ),
    closure_attachments:TBL_Closure_Attachments (
      Closure_Attachment_ID,
      Storage_Path,
      File_Name,
      Mime_Type,
      File_Size,
      Created_At
    )
  )
`.trim();