------------------------------- MODULE Workflow -------------------------------
EXTENDS Naturals, RuntimeTables
CONSTANT Machine
Edges == IF Machine = "photo" THEN PhotoEdges ELSE DetailEdges
Async == {"encoding", "saving", "publishing", "loading", "voting", "reporting", "removing"}
States == {e[1] : e \in Edges} \cup {e[3] : e \in Edges}
Slots == {1, 2}
VARIABLES phase, owner, pending
vars == <<phase, owner, pending>>
Init == /\ phase = "idle" /\ owner = 0
        /\ pending = [i \in Slots |-> "free"]

\* A slot abstracts a fresh JavaScript object. Never recycle a slot until the
\* old promise settles, even if its dialog has already gone away.
User(e) ==
  /\ e[1] = phase
  /\ e[2] \notin {"encoded","saved","published","loaded","success","failed"}
  /\ phase' = e[3]
  /\ IF phase' \in Async
        THEN \E i \in Slots : /\ pending[i] = "free"
                              /\ owner' = i
                              /\ pending' = [pending EXCEPT ![i] = phase']
        ELSE /\ owner' = 0 /\ UNCHANGED pending

Dismiss == /\ phase' = "idle" /\ owner' = 0 /\ UNCHANGED pending

Finish(i, e) ==
  /\ pending[i] = e[1]
  /\ e[2] \in {"encoded","saved","published","loaded","success","failed"}
  /\ pending' = [pending EXCEPT ![i] = "free"]
  /\ IF owner = i /\ phase = e[1]
        THEN /\ phase' = e[3] /\ owner' = 0
        ELSE UNCHANGED <<phase, owner>>

Next == Dismiss \/ (\E e \in Edges : User(e) \/ (\E i \in Slots : Finish(i,e)))
Spec == Init /\ [][Next]_vars

TypeOK == /\ phase \in States /\ pending \in [Slots -> Async \cup {"free"}]
          /\ IF phase \in Async THEN owner \in Slots /\ pending[owner] = phase ELSE owner = 0

\* A completion from an abandoned visit cannot touch even a later visit to
\* the same phase. Pending entries may disappear as their promises settle.
StaleIsSilent == \A i \in Slots :
  (pending[i] # "free" /\ pending'[i] = "free" /\ owner # i)
    => UNCHANGED <<phase, owner>>
Authorization ==
  /\ (phase' = "reporting" /\ phase # phase') => phase = "confirmReport"
  /\ (phase' = "removing" /\ phase # phase') => phase = "confirmRemove"
  /\ (phase' = "publishing" /\ phase # phase') => phase = "form"
  /\ (phase' = "published" /\ phase # phase') => phase = "publishing"

VisitSafety == [][StaleIsSilent /\ Authorization]_vars
\* Given eventual settlement by the browser/server, a working screen can
\* always be left. An unresponsive network is outside this assumption.
Settle(i) == \E e \in Edges : Finish(i,e)
FairSpec == Spec /\ (\A i \in Slots : WF_vars(Settle(i)))
EventuallySettles == \A i \in Slots : (pending[i] # "free") ~> (pending[i] = "free")
=============================================================================
