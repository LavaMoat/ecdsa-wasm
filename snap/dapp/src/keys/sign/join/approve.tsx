import React, { useEffect, useContext, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import { Box, Chip, Stack, Typography, CircularProgress } from "@mui/material";

import { SessionKind, GroupInfo, Session } from "@metamask/mpc-client";

import { WebSocketContext } from "../../../websocket-provider";
import { joinGroupSession, loadPartyNumber } from "../../../group-session";
import { setSnackbar } from "../../../store/snackbars";
import { keysSelector, KeyShareGroup } from "../../../store/keys";

import { setGroup, setSession, setSignCandidate } from "../../../store/session";
import { SignValue, SignMessage, SigningType } from "../../../types";

import NotFound from "../../../not-found";
import KeysLoader from "../../loader";
import Approval from "../approval";
import SignMessageView from "../message-view";
import ChooseKeyShare from "../choose-key-share";
import PublicAddress from "../../../components/public-address";

import { StepProps } from "./index";

type SessionConnectProps = {
  address: string;
  groupId: string;
  sessionId: string;
  keyShare: KeyShareGroup;
  signingType: SigningType;
  onApprove: (
    group: GroupInfo,
    session: Session,
    selectedParty: number,
    value: SignValue
  ) => void;
};

function SessionConnect(props: SessionConnectProps) {
  const dispatch = useDispatch();
  const websocket = useContext(WebSocketContext);
  const { address, groupId, sessionId, keyShare, signingType, onApprove } =
    props;
  const [label, setLabel] = useState("...");
  const [value, setValue] = useState<SignValue>(null);
  const [groupSession, setGroupSession] = useState<[GroupInfo, Session]>(null);
  const [selectedParty, setSelectedParty] = useState(null);
  const [progressVisible, setProgressVisible] = useState(true);
  const { items } = keyShare;

  const onShareChange = (n: number) => {
    setSelectedParty(n);
  };

  const doApprove = () => {
    const [group, session] = groupSession;
    onApprove(group, session, selectedParty || items[0], value);
  };

  useEffect(() => {
    // Delay a little so we don't get flicker when the connection
    // is very fast.
    setTimeout(async () => {
      try {
        const [group, session] = await joinGroupSession(
          SessionKind.SIGN,
          groupId,
          sessionId,
          websocket
        );

        setValue(session.value);
        setLabel(group.label);

        setGroupSession([group, session]);

        dispatch(setGroup(group));
        dispatch(setSession(session));

        setProgressVisible(false);
      } catch (e) {
        console.error(e);
        dispatch(
          setSnackbar({
            message: e.message || "",
            severity: "error",
          })
        );
      }

    }, 1000);
  }, []);

  let preview = null;
  if (value) {
    preview =
      signingType === SigningType.MESSAGE ? (
        <SignMessageView
          message={(value as SignMessage).message}
          digest={value.digest}
        />
      ) : (
        <p>TODO: show transaction preview</p>
      );
  }

  return (
    <Stack spacing={2} marginTop={2} padding={1}>
      <Stack>
        <Typography variant="h4" component="div">
          {label}
        </Typography>
        <Stack direction="row" alignItems="center">
          <PublicAddress address={address} />
          <Box sx={{ flexGrow: 1 }} />
          <Chip
            label={`Using key share for party #${selectedParty || items[0]}`}
          />
        </Stack>
      </Stack>
      <Stack>
        <Typography variant="body1" component="div">
          You have been invited to sign a {signingType}.
        </Typography>
        <Typography variant="body2" component="div" color="text.secondary">
          Approve the {signingType} to sign it.
        </Typography>
      </Stack>
      {progressVisible && (
        <Stack direction="row" alignItems="center" spacing={2}>
          <CircularProgress size={20} />
          <Typography variant="body2" component="div" color="text.secondary">
            Connecting to session...
          </Typography>
        </Stack>
      )}
      <ChooseKeyShare
        keyShare={keyShare}
        onShareChange={onShareChange}
        selectedParty={selectedParty || keyShare.items[0]}
      />
      {value && preview}
      {value && <Approval signingType={signingType} onApprove={doApprove} />}
    </Stack>
  );
}

export default function Approve(props: StepProps) {
  const dispatch = useDispatch();
  const websocket = useContext(WebSocketContext);
  const { address, next, signingType, groupId, sessionId } = props;
  const { keyShares, loaded } = useSelector(keysSelector);

  if (!loaded) {
    return <KeysLoader />;
  }

  const keyShare = keyShares.find((value: [string, KeyShareGroup]) => {
    const [keyAddress] = value;
    return address === keyAddress;
  });

  if (!keyShare) {
    return (
      <Stack marginTop={4}>
        <NotFound />
      </Stack>
    );
  }

  const onApprove = async (
    group: GroupInfo,
    session: Session,
    selectedParty: number,
    value: SignValue
  ) => {
    try {
      await loadPartyNumber(
        SessionKind.SIGN,
        group,
        session,
        websocket,
        dispatch,
        selectedParty
      );

      const signCandidate = {
        address,
        signingType,
        selectedParty,
        value,
        creator: false,
      };
      dispatch(setSignCandidate(signCandidate));
      next();
    } catch (e) {
      dispatch(
        setSnackbar({
          message: e.message || "Failed to load party number into session",
          severity: "error",
        })
      );
    }
  };

  const keyShareGroup: KeyShareGroup = keyShare[1];
  return (
    <SessionConnect
      address={address}
      groupId={groupId}
      sessionId={sessionId}
      keyShare={keyShareGroup}
      signingType={signingType}
      onApprove={onApprove}
    />
  );
}
